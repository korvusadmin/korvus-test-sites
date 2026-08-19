import type { Page, Route } from "@playwright/test"

// --- Types mirrored from platform/snippet/src/types.ts (decoupled from snippet build) ---
//
// Regle : ce miroir declare EXACTEMENT les memes noms de champs que les
// interfaces homonymes de platform/snippet/src/types.ts. Un champ en trop
// type ce que le snippet n'emet plus ; un champ en moins rend le champ
// inassertable par les specs, donc invisible s'il casse.
//
// Les TYPES, eux, restent volontairement decouples : le miroir ne peut pas
// importer les unions fermees du snippet (Platform, LoafSummary) sans se
// recoupler au build. On reflete leur forme large.
//
// Le verrou est `platform/tests/unit/snippet/ingest-interceptor-mirror.test.ts`,
// qui compare les deux jeux de champs. Il ne compare pas les types.
//
// ENG-242 (2026-08-19) : remise a niveau apres trois derives accumulees --
// 8 champs product_* de PageviewPayload retires du snippet en v1.0.0 (drop
// product cascade) mais restes ici, et 6 champs ajoutes cote snippet depuis
// jamais reportes. Le verrou etait aveugle : il verifiait une liste en dur.

export interface SessionPayload {
  id: string
  created_at: string
  website_id: string
  consent_status: "granted" | "denied" | "unknown"
  // Provenance du statut de consentement, format `<detector>:<method>`.
  consent_source?: string | null
  referrer_domain: string | null
  connection_type: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  has_fbclid: boolean
  has_gclid: boolean
  has_ttclid: boolean
  viewport_width: number | null
  is_dark_mode: boolean | null
  has_adblocker: boolean | null
  pixels_loaded: string[]
  pixels_blocked: string[]
  // Union fermee `Platform` cote snippet, reflete large ici (cf. en-tete).
  platform?: string | null
  snippet_version?: string | null
}

export interface PageviewPayload {
  id: string
  created_at: string
  website_id: string
  session_id: string
  path: string
  query_params?: Record<string, string> | null
  page_type?: string | null
  ttfb_ms?: number | null
  fcp_ms?: number | null
  lcp_ms?: number | null
  lcp_element?: Record<string, unknown> | null
  inp_ms?: number | null
  inp_element?: Record<string, unknown> | null
  cls_score?: number | null
  cls_largest_shift?: Record<string, unknown> | null
  resource_timings?: Record<string, unknown>[] | null
  // `LoafSummary` cote snippet, reflete large ici (cf. en-tete).
  loaf?: Record<string, unknown> | null
  scripts_hash?: string | null
  // --- Page d'erreur ---
  is_error_page?: boolean | null
  http_status?: number | null
  // --- Navigation & engagement (Bloc 4) ---
  navigation_type?: string | null
  // Pageview demarre onglet masque / prerender : Web Vitals aberrantes,
  // exclues des agregats Lenteur cote platform.
  started_hidden?: boolean | null
  visibility_time_ms?: number | null
  max_scroll_depth_pct?: number | null
  has_interacted?: boolean | null
  time_to_first_interaction_ms?: number | null
  was_bfcache_restore?: boolean | null
  long_tasks_count?: number | null
  total_blocking_time_ms?: number | null
  cache_age_seconds?: number | null
}

export interface EventPayload {
  session_id: string
  pageview_id: string
  website_id: string
  event_name: string
  value?: number | null
  currency?: string | null
  payload: Record<string, unknown>
}

export interface BatchPayload {
  session: SessionPayload
  pageviews: PageviewPayload[]
  events: EventPayload[]
  // Audit round 4 #2 — idempotency key posée par le snippet au build, stable
  // sur retry via la sessionStorage queue. Le serveur dédup via Redis SET NX.
  client_batch_id?: string
}

// --- Interceptor ---

type BatchResolver = (batch: BatchPayload) => void

/**
 * Intercepts POST requests to /api/ingest via Playwright route interception.
 * Stores each batch payload for later assertion.
 *
 * Usage:
 *   const interceptor = new IngestInterceptor(page)
 *   await interceptor.attach()
 *   // ... navigate, trigger actions ...
 *   await interceptor.triggerFlush()
 *   const events = interceptor.getEvents("js_error")
 */
export class IngestInterceptor {
  private batches: BatchPayload[] = []
  private pendingResolvers: BatchResolver[] = []
  private page: Page
  // Phase 7 A2 — header auth vu sur le dernier POST intercepté. Permet à
  // un spec de vérifier la rotation / valeur exacte si besoin.
  private lastApiKeyHeader: string | undefined = undefined

  constructor(page: Page) {
    this.page = page
  }

  /** Attach route interception — call before navigating. */
  async attach(): Promise<void> {
    await this.page.route("**/api/ingest", async (route: Route) => {
      const request = route.request()

      if (request.method() !== "POST") {
        await route.fallback()
        return
      }

      // Phase 7 A2 — sécurité défense en profondeur : le snippet v2 envoie
      // obligatoirement un header `X-API-Key` (cf. platform/app/api/ingest/route.ts).
      // Si un collector ou le transport se met à l'oublier, la prod va
      // retourner 401 pendant que les tests mockés passent silencieusement.
      // On fail-closed : pas de X-API-Key = 401 côté mock, forçant le test
      // à rater visiblement. On accepte la casse header insensitive.
      const headers = request.headers()
      const apiKey =
        headers["x-api-key"] ?? headers["X-API-Key"] ?? headers["X-Api-Key"]
      if (!apiKey || apiKey.trim() === "") {
        // eslint-disable-next-line no-console
        console.warn(
          "[IngestInterceptor] POST /api/ingest missing X-API-Key header — responding 401 to fail the spec loudly.",
        )
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Missing API key" }),
        })
        return
      }
      this.lastApiKeyHeader = apiKey

      try {
        const body = request.postDataJSON() as BatchPayload

        const invalidField = IngestInterceptor.findInvalidUuidField(body)
        if (invalidField) {
          // eslint-disable-next-line no-console
          console.warn(
            `[IngestInterceptor] POST /api/ingest invalid UUID (${invalidField}) — responding 400 to fail the spec loudly.`,
          )
          await route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({ error: `Invalid UUID: ${invalidField}` }),
          })
          return
        }

        this.batches.push(body)

        // Resolve any pending waitForBatch promises
        const resolvers = this.pendingResolvers.splice(0)
        for (const resolve of resolvers) {
          resolve(body)
        }
      } catch {
        // Non-JSON or malformed body — still respond 200
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      })
    })
  }

  /**
   * Phase 7 A2 — returns the X-API-Key header value from the most recent
   * intercepted POST, or undefined if no batch has been received yet.
   * Useful for specs that want to assert the exact header value (e.g.
   * to detect a rotation that would break prod silently).
   */
  getApiKeyHeader(): string | undefined {
    return this.lastApiKeyHeader
  }

  /** Return all events across all batches, optionally filtered by event_name. */
  getEvents(eventName?: string): EventPayload[] {
    const all = this.batches.flatMap((b) => b.events)
    if (eventName === undefined) return all
    return all.filter((e) => e.event_name === eventName)
  }

  /** Return the session payload from the first batch received. */
  getSession(): SessionPayload | undefined {
    return this.batches[0]?.session
  }

  /** Return all pageviews across all batches. */
  getPageviews(): PageviewPayload[] {
    return this.batches.flatMap((b) => b.pageviews)
  }

  /** Return all raw batches for advanced assertions. */
  getAllBatches(): BatchPayload[] {
    return [...this.batches]
  }

  /** Return the number of batches received so far. */
  getBatchCount(): number {
    return this.batches.length
  }

  /** Wait for the next batch to arrive. Rejects on timeout. */
  waitForBatch(timeout = 35_000): Promise<BatchPayload> {
    return new Promise<BatchPayload>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.pendingResolvers.indexOf(wrappedResolve)
        if (idx !== -1) this.pendingResolvers.splice(idx, 1)
        reject(new Error(`waitForBatch: no batch received within ${timeout}ms`))
      }, timeout)

      const wrappedResolve: BatchResolver = (batch) => {
        clearTimeout(timer)
        resolve(batch)
      }

      this.pendingResolvers.push(wrappedResolve)
    })
  }

  /**
   * Wait until an event with the given name appears in any batch.
   * Checks existing batches first, then waits for new ones.
   */
  async waitForEvent(
    eventName: string,
    timeout = 35_000,
  ): Promise<EventPayload> {
    // Check existing batches
    const existing = this.getEvents(eventName)
    if (existing.length > 0) return existing[0]

    // Poll new batches until found or timeout
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) break

      try {
        const batch = await this.waitForBatch(remaining)
        const match = batch.events.find((e) => e.event_name === eventName)
        if (match) return match
      } catch {
        break // timeout from waitForBatch
      }
    }

    throw new Error(
      `waitForEvent: event "${eventName}" not found within ${timeout}ms`,
    )
  }

  /**
   * Deterministic wait: resolves as soon as every `payload.message` in
   * `messages` has been seen across all received batches, rejects on timeout.
   * Replaces temporal polling — the resolution is driven by batch arrival, not
   * a fixed sleep, so a large flush split across several POSTs (or an early
   * flush + a final flush) is awaited correctly without flakiness.
   */
  async waitForEventMessages(
    messages: string[],
    timeout = 35_000,
  ): Promise<void> {
    const need = new Set(messages)
    const haveAll = (): boolean => {
      const seen = new Set(
        this.getEvents().map((e) => e.payload.message as string),
      )
      for (const m of need) if (!seen.has(m)) return false
      return true
    }
    if (haveAll()) return
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) break
      try {
        await this.waitForBatch(remaining)
      } catch {
        break // timeout from waitForBatch
      }
      if (haveAll()) return
    }
    throw new Error(
      `waitForEventMessages: ${
        [...need].filter(
          (m) =>
            !new Set(
              this.getEvents().map((e) => e.payload.message as string),
            ).has(m),
        ).length
      } of ${messages.length} expected messages missing within ${timeout}ms`,
    )
  }

  /**
   * Force the snippet to flush its buffer by simulating visibilitychange → hidden.
   * This avoids waiting the full 30s batch interval.
   * Restores visible state afterward.
   */
  async triggerFlush(): Promise<void> {
    await this.page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        writable: true,
        configurable: true,
      })
      document.dispatchEvent(new Event("visibilitychange"))
    })

    // Wait for the intercepted fetch to complete (quasi-instant locally)
    await this.waitForBatch(5_000).catch(() => {
      // No batch means buffer was empty — that's fine
    })

    // Restore visible state so the snippet resumes normal operation
    await this.page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        writable: true,
        configurable: true,
      })
    })
  }

  // --- UUID validation — mirrors server-side Zod (z.string().uuid()) ---

  private static readonly UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  private static isUuid(v: unknown): boolean {
    return typeof v === "string" && IngestInterceptor.UUID_RE.test(v)
  }

  private static findInvalidUuidField(body: BatchPayload): string | null {
    if (!IngestInterceptor.isUuid(body.session?.id)) return "session.id"
    if (!IngestInterceptor.isUuid(body.session?.website_id))
      return "session.website_id"
    for (let i = 0; i < (body.pageviews?.length ?? 0); i++) {
      const pv = body.pageviews[i]
      if (!IngestInterceptor.isUuid(pv.id)) return `pageviews[${i}].id`
      if (!IngestInterceptor.isUuid(pv.session_id))
        return `pageviews[${i}].session_id`
      if (!IngestInterceptor.isUuid(pv.website_id))
        return `pageviews[${i}].website_id`
    }
    for (let i = 0; i < (body.events?.length ?? 0); i++) {
      const ev = body.events[i]
      if (!IngestInterceptor.isUuid(ev.pageview_id))
        return `events[${i}].pageview_id`
      if (!IngestInterceptor.isUuid(ev.session_id))
        return `events[${i}].session_id`
      if (!IngestInterceptor.isUuid(ev.website_id))
        return `events[${i}].website_id`
    }
    return null
  }

  /** Reset all stored batches and pending resolvers. */
  clear(): void {
    this.batches = []
    this.pendingResolvers = []
  }
}
