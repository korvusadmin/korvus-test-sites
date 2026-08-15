import { test, expect } from "@playwright/test"
import type { Page } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { gzipSync } from "node:zlib"
import { IngestInterceptor } from "../helpers/ingest-interceptor"
import { injectSnippet, getSiteConfig } from "../helpers/inject-snippet"

// All tests run on doomcheck (port 3003)

const doomcheck = getSiteConfig("doomcheck")

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface WebPerfMetrics {
  lcp: number
  fcp: number
  ttfb: number
}

/** Block doomcheck's native snippet to avoid interference. */
async function blockNativeSnippet(page: Page): Promise<void> {
  await page.route("**/api/snippet/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "// blocked by test harness",
    }),
  )
}

/** Collect LCP, FCP, TTFB from the current page after load. */
async function collectMetrics(page: Page): Promise<WebPerfMetrics> {
  await page.waitForLoadState("load")
  await page.waitForTimeout(2500)

  return page.evaluate(() => {
    return new Promise<{ lcp: number; fcp: number; ttfb: number }>(
      (resolve) => {
        let resolved = false
        const metrics = { lcp: 0, fcp: 0, ttfb: 0 }

        // TTFB from navigation timing
        const nav = performance.getEntriesByType("navigation")
        if (nav.length > 0) {
          const n = nav[0] as PerformanceNavigationTiming
          metrics.ttfb = n.responseStart - n.requestStart
        }

        // FCP from paint timing
        const paints = performance.getEntriesByType("paint")
        const fcp = paints.find((e) => e.name === "first-contentful-paint")
        if (fcp) metrics.fcp = fcp.startTime

        // LCP via PerformanceObserver with buffered replay
        try {
          const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries()
            if (entries.length > 0) {
              metrics.lcp = entries[entries.length - 1].startTime
            }
            observer.disconnect()
            if (!resolved) {
              resolved = true
              resolve(metrics)
            }
          })
          observer.observe({
            type: "largest-contentful-paint",
            buffered: true,
          })
        } catch {
          // LCP observer not supported — resolve without it
        }

        // Safety timeout
        setTimeout(() => {
          if (!resolved) {
            resolved = true
            resolve(metrics)
          }
        }, 2000)
      },
    )
  })
}

function average(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

/** Verify that the doomcheck site is visually intact and functional. */
async function assertSiteWorks(page: Page): Promise<void> {
  // Header visible with logo
  await expect(page.locator("header")).toBeVisible()
  await expect(page.locator('header a[href="/"]')).toBeVisible()

  // Main content area visible
  await expect(page.locator("main")).toBeVisible()

  // Footer visible
  await expect(page.locator("footer")).toBeVisible()
}

/** Collect console errors — returns array of error messages. */
function setupConsoleMonitor(page: Page): string[] {
  const errors: string[] = []
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text())
    }
  })
  page.on("pageerror", (err) => {
    errors.push(err.message)
  })
  return errors
}

// ---------------------------------------------------------------------------
// Test 1 — Impact Core Web Vitals
// ---------------------------------------------------------------------------

test.describe("Test 1 — Impact Core Web Vitals", () => {
  test.describe.configure({ retries: 2 })

  test("snippet does not degrade LCP, FCP, or TTFB beyond thresholds", async ({
    context,
  }) => {
    test.setTimeout(120_000)

    const RUNS = 5

    // --- Runs WITHOUT snippet ---
    const withoutMetrics: WebPerfMetrics[] = []
    for (let i = 0; i < RUNS; i++) {
      const p = await context.newPage()
      await blockNativeSnippet(p)
      await p.goto("/")
      const m = await collectMetrics(p)
      withoutMetrics.push(m)
      await p.close()
    }

    // --- Runs WITH snippet ---
    const withMetrics: WebPerfMetrics[] = []
    for (let i = 0; i < RUNS; i++) {
      const p = await context.newPage()
      await injectSnippet(p, "doomcheck")
      await p.goto("/")
      const m = await collectMetrics(p)
      withMetrics.push(m)
      await p.close()
    }

    // --- Compare averages ---
    const avgWithout = {
      lcp: average(withoutMetrics.map((m) => m.lcp)),
      fcp: average(withoutMetrics.map((m) => m.fcp)),
      ttfb: average(withoutMetrics.map((m) => m.ttfb)),
    }
    const avgWith = {
      lcp: average(withMetrics.map((m) => m.lcp)),
      fcp: average(withMetrics.map((m) => m.fcp)),
      ttfb: average(withMetrics.map((m) => m.ttfb)),
    }

    const deltaLcp = avgWith.lcp - avgWithout.lcp
    const deltaFcp = avgWith.fcp - avgWithout.fcp
    const deltaTtfb = avgWith.ttfb - avgWithout.ttfb

    expect(
      deltaLcp,
      `LCP delta ${deltaLcp.toFixed(1)}ms should be < 100ms (without: ${avgWithout.lcp.toFixed(1)}, with: ${avgWith.lcp.toFixed(1)})`,
    ).toBeLessThan(100)

    // FCP/TTFB thresholds aligned on LCP (100ms) — anti-catastrophe gate only.
    // Dev server cold-compile + shared CI runners produce single-digit-to-low-
    // double-digit ms variance run-to-run; a tighter bound flakes without
    // signaling a real regression. True perf measurement lives in Phase 6 RUM.
    expect(
      deltaFcp,
      `FCP delta ${deltaFcp.toFixed(1)}ms should be < 100ms (without: ${avgWithout.fcp.toFixed(1)}, with: ${avgWith.fcp.toFixed(1)})`,
    ).toBeLessThan(100)

    expect(
      deltaTtfb,
      `TTFB delta ${deltaTtfb.toFixed(1)}ms should be < 100ms (without: ${avgWithout.ttfb.toFixed(1)}, with: ${avgWith.ttfb.toFixed(1)})`,
    ).toBeLessThan(100)
  })
})

// ---------------------------------------------------------------------------
// Test 2 — Fetch integrity
// ---------------------------------------------------------------------------

interface FetchResult {
  url: string
  status: number
  body: string
  bodyLength: number
  contentType: string
  ok: boolean
  errorMessage?: string
}

interface FetchFixture {
  status: number
  contentType: string
  body: string
}

const FETCH_FIXTURES: Record<string, FetchFixture> = {
  "/__fetch-integrity/json": {
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ message: "stable", items: [1, 2, 3] }),
  },
  "/__fetch-integrity/unicode": {
    status: 200,
    contentType: "text/plain; charset=utf-8",
    body: "Korvus — été 🐦\nligne 2",
  },
  "/__fetch-integrity/empty": {
    status: 204,
    contentType: "text/plain; charset=utf-8",
    body: "",
  },
  "/__fetch-integrity/not-found": {
    status: 404,
    contentType: "text/plain; charset=utf-8",
    body: "fixture not found",
  },
  "/__fetch-integrity/server-error": {
    status: 500,
    contentType: "application/problem+json; charset=utf-8",
    body: JSON.stringify({ error: "deterministic failure" }),
  },
}

const FETCH_CASES = Object.keys(FETCH_FIXTURES).map((url) => ({
  url,
  method: "GET",
}))

async function installFetchIntegrityFixtures(page: Page): Promise<void> {
  await page.route("**/__fetch-integrity/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname
    const fixture = FETCH_FIXTURES[pathname]
    if (!fixture) {
      await route.abort("failed")
      return
    }

    await route.fulfill({
      status: fixture.status,
      headers: fixture.contentType
        ? { "Content-Type": fixture.contentType }
        : {},
      body: fixture.body,
    })
  })
}

test.describe("Test 2 — Fetch integrity", () => {
  async function runFetchSuite(
    page: Page,
  ): Promise<FetchResult[]> {
    return page.evaluate(
      async (cases: { url: string; method: string }[]) => {
        const results: FetchResult[] = []
        for (const c of cases) {
          try {
            const res = await fetch(c.url, { method: c.method })
            const body = await res.text()
            results.push({
              url: c.url,
              status: res.status,
              body,
              bodyLength: body.length,
              contentType: res.headers.get("content-type") ?? "",
              ok: res.ok,
            })
          } catch (err: unknown) {
            results.push({
              url: c.url,
              status: 0,
              body: "",
              bodyLength: 0,
              contentType: "",
              ok: false,
              errorMessage:
                err instanceof Error ? err.message : String(err),
            })
          }
        }
        return results
      },
      FETCH_CASES,
    )
  }

  test("monkey-patched fetch returns identical responses", async ({
    context,
  }) => {
    // --- WITHOUT snippet ---
    const pageWithout = await context.newPage()
    await blockNativeSnippet(pageWithout)
    await installFetchIntegrityFixtures(pageWithout)
    await pageWithout.goto("/")
    const resultsWithout = await runFetchSuite(pageWithout)
    await pageWithout.close()

    // --- WITH snippet ---
    const pageWith = await context.newPage()
    await injectSnippet(pageWith, "doomcheck")
    await installFetchIntegrityFixtures(pageWith)
    await pageWith.goto("/")
    const resultsWith = await runFetchSuite(pageWith)
    await pageWith.close()

    // --- Compare ---
    expect(resultsWith.length).toBe(resultsWithout.length)

    for (let i = 0; i < resultsWithout.length; i++) {
      const without = resultsWithout[i]
      const withSnippet = resultsWith[i]
      const fixture = FETCH_FIXTURES[without.url]

      expect(fixture, `Fetch ${without.url}: fixture should exist`).toBeDefined()
      expect(without.status).toBe(fixture.status)
      expect(without.body).toBe(fixture.body)
      expect(without.contentType.split(";", 1)[0]).toBe(
        fixture.contentType.split(";", 1)[0],
      )

      expect(
        withSnippet.status,
        `Fetch ${without.url}: status should match (expected ${without.status}, got ${withSnippet.status})`,
      ).toBe(without.status)

      expect(
        withSnippet.bodyLength,
        `Fetch ${without.url}: body length should match (expected ${without.bodyLength}, got ${withSnippet.bodyLength})`,
      ).toBe(without.bodyLength)

      expect(
        withSnippet.body,
        `Fetch ${without.url}: decoded body should match exactly`,
      ).toBe(without.body)

      expect(
        withSnippet.contentType,
        `Fetch ${without.url}: content-type should match`,
      ).toBe(without.contentType)

      expect(
        withSnippet.ok,
        `Fetch ${without.url}: ok should match`,
      ).toBe(without.ok)
    }
  })

  test("cross-origin fetch error is preserved", async ({ context }) => {
    // --- WITHOUT snippet ---
    const pageWithout = await context.newPage()
    await blockNativeSnippet(pageWithout)
    await pageWithout.goto("/")
    await pageWithout.waitForTimeout(1500)

    const errorWithout = await pageWithout.evaluate(async () => {
      try {
        await fetch("https://this-domain-does-not-exist-korvus-test.invalid/test")
        return null
      } catch (err: unknown) {
        return err instanceof Error ? err.constructor.name : "unknown"
      }
    })
    await pageWithout.close()

    // --- WITH snippet ---
    const pageWith = await context.newPage()
    await injectSnippet(pageWith, "doomcheck")
    await pageWith.goto("/")
    await pageWith.waitForTimeout(2000)

    const errorWith = await pageWith.evaluate(async () => {
      try {
        await fetch("https://this-domain-does-not-exist-korvus-test.invalid/test")
        return null
      } catch (err: unknown) {
        return err instanceof Error ? err.constructor.name : "unknown"
      }
    })
    await pageWith.close()

    // Both should throw TypeError
    expect(errorWithout).toBe("TypeError")
    expect(errorWith).toBe("TypeError")
  })
})

// ---------------------------------------------------------------------------
// Test 3 — Crash isolation
// ---------------------------------------------------------------------------

test.describe("Test 3 — Crash isolation", () => {
  // --- 3a: Corrupted config ---

  test("3a — corrupted config: site works with missing websiteId", async ({
    page,
  }) => {
    const errors = setupConsoleMonitor(page)
    await blockNativeSnippet(page)

    // Inject snippet with missing websiteId → readConfig returns null → snippet never boots
    await injectSnippet(page, {
      websiteId: "",
      apiKey: doomcheck.apiKey,
      endpoint: doomcheck.endpoint,
    })

    await page.goto("/")
    await page.waitForTimeout(1500)

    await assertSiteWorks(page)

    // h1 with hero text should be visible
    await expect(page.locator("h1")).toBeVisible()

    // No Korvus errors in console
    const korvusErrors = errors.filter((e) =>
      e.toLowerCase().includes("korvus"),
    )
    expect(
      korvusErrors,
      "No Korvus-related console errors should appear",
    ).toHaveLength(0)
  })

  test("3a — corrupted config: site works with unreachable endpoint", async ({
    page,
  }) => {
    const errors = setupConsoleMonitor(page)

    // Snippet boots but all fetches to the endpoint fail
    await injectSnippet(page, {
      ...doomcheck,
      // Hostname must NOT contain "korvus" — the assertion below filters
      // console errors via .includes("korvus"), and Chromium logs the failed
      // DNS resolution ("Error resolving \"...\"") which would match the
      // filter and trigger a false positive.
      endpoint: "https://unreachable-endpoint-test.invalid/api/ingest",
    })

    await page.goto("/")
    await page.waitForTimeout(2000)

    await assertSiteWorks(page)
    await expect(page.locator("h1")).toBeVisible()

    // Navigate to a PDP
    await page.goto("/products/novapro-x12")
    await page.waitForTimeout(1500)

    await assertSiteWorks(page)
    await expect(
      page.locator("h1"),
      "Product title should be visible",
    ).toContainText("NovaPro X12")

    const korvusErrors = errors.filter((e) =>
      e.toLowerCase().includes("korvus"),
    )
    expect(
      korvusErrors,
      "No Korvus-related console errors should appear",
    ).toHaveLength(0)
  })

  // --- 3b: Endpoint returns 500 ---

  test("3b — endpoint always 500: site works normally", async ({ page }) => {
    const errors = setupConsoleMonitor(page)

    // Route all ingest calls to return 500
    await page.route("**/api/ingest", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: '{"error": "server down"}',
      }),
    )

    await injectSnippet(page, "doomcheck")

    await page.goto("/")
    await page.waitForTimeout(1500)

    await assertSiteWorks(page)
    await expect(page.locator("h1")).toBeVisible()

    // Navigate to PDP and click ATC to prove interaction still works
    await page.goto("/products/novapro-x12")
    await page.waitForTimeout(1500)

    await expect(
      page.locator("h1"),
      "Product title visible",
    ).toContainText("NovaPro X12")

    // Click ATC button
    const atcButton = page.locator("button", { hasText: "Add to Cart" })
    await expect(atcButton).toBeVisible()
    await atcButton.click()

    // Cart count should appear in header
    await expect(
      page.locator("header").locator("span.bg-doom-red"),
      "Cart badge should appear after ATC click",
    ).toBeVisible({ timeout: 3000 })

    const korvusErrors = errors.filter((e) =>
      e.toLowerCase().includes("korvus"),
    )
    expect(
      korvusErrors,
      "No Korvus-related console errors should appear",
    ).toHaveLength(0)
  })

  // --- 3c: sessionStorage unavailable ---

  test("3c — sessionStorage blocked: site works normally", async ({
    page,
  }) => {
    const errors = setupConsoleMonitor(page)

    // Block sessionStorage BEFORE snippet boots
    await page.addInitScript(() => {
      Object.defineProperty(window, "sessionStorage", {
        get() {
          throw new DOMException("Storage blocked by test")
        },
        configurable: true,
      })
    })

    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")

    await page.goto("/")
    await page.waitForTimeout(2000)

    await assertSiteWorks(page)
    await expect(page.locator("h1")).toBeVisible()

    // Navigate and interact
    await page.goto("/products/novapro-x12")
    await page.waitForTimeout(1500)

    await expect(page.locator("h1")).toContainText("NovaPro X12")

    const korvusErrors = errors.filter((e) =>
      e.toLowerCase().includes("korvus"),
    )
    expect(
      korvusErrors,
      "No Korvus-related console errors should appear",
    ).toHaveLength(0)
  })

  // --- 3d: sendBeacon unavailable ---

  test("3d — sendBeacon removed: site works normally", async ({ page }) => {
    const errors = setupConsoleMonitor(page)

    // Remove sendBeacon before snippet boots
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(navigator as any).sendBeacon = undefined
    })

    await injectSnippet(page, "doomcheck")

    await page.goto("/")
    await page.waitForTimeout(2000)

    await assertSiteWorks(page)
    await expect(page.locator("h1")).toBeVisible()

    // Navigate to PDP
    await page.goto("/products/novapro-x12")
    await page.waitForTimeout(1500)

    await expect(page.locator("h1")).toContainText("NovaPro X12")

    // Click ATC — site interaction should work
    const atcButton = page.locator("button", { hasText: "Add to Cart" })
    await expect(atcButton).toBeVisible()
    await atcButton.click()

    await expect(
      page.locator("header").locator("span.bg-doom-red"),
      "Cart badge should appear after ATC click",
    ).toBeVisible({ timeout: 3000 })

    const korvusErrors = errors.filter((e) =>
      e.toLowerCase().includes("korvus"),
    )
    expect(
      korvusErrors,
      "No Korvus-related console errors should appear",
    ).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Phase 3 — Smoke perf gates v2 (pré-release client)
// ---------------------------------------------------------------------------
//
// ⚠️ LIMITE CONNUE : ces mesures tournent en local sur Next.js dev server,
// même process que Playwright, zéro trafic, zéro CDN, pas de compression
// HTTP variable, pas de latence réseau. Elles ne reflètent PAS l'impact
// perf réel sur un vrai site client en prod.
//
// Ce qui EST fiable ici :
//   - Gate 1 (bundle size gzip) : déterministe, insensible à l'env → contrat
//     dur. Un snippet qui dépasse 110 KB gzip sort de CI, point.
//
// Ce qui N'EST PAS fiable et pourquoi les seuils sont permissifs :
//   - Gate 2 (TBT delta)    : filet anti-catastrophe seulement. Seuil large
//                             (500 ms) pour catcher un snippet bloquant
//                             massivement sans produire de faux positifs
//                             sur la noise dev-server.
//   - Gate 3 (long tasks Δ) : filet anti-catastrophe. Seuil large (≤ 5)
//                             pour la même raison.
//
// 📌 Phase 6 (todo) : mesure perf réelle via RUM en prod.
//   Instrumenter web-vitals côté client chez le premier client pilote,
//   baseline 7j, alerter si p75 LCP dégrade > 10% vs baseline. Ces gates
//   locaux ne remplacent PAS cette instrumentation — ils attrapent
//   uniquement une régression grossière au niveau du snippet lui-même.

const SNIPPET_DIST_PATH = process.env.KORVUS_SNIPPET_PATH
  ? path.resolve(process.env.KORVUS_SNIPPET_PATH)
  : path.resolve(
      __dirname,
      "..",
      "..",
      "..",
      "platform",
      "snippet",
      "dist",
      "korvus.min.js",
    )

// Gate 1 = contrat dur. Les deux autres sont des smoke tests anti-catastrophe.
const MAX_GZIP_BYTES = 110 * 1024 // 110 KB — hard contract
const MAX_TBT_DELTA_MS = 500 // smoke only — noise dev-server
const MAX_LONG_TASKS_DELTA = 5 // smoke only — noise dev-server

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

interface BlockingMetrics {
  // Total Blocking Time : somme des (duration - 50ms) pour chaque long task
  // entre FCP et un point stable post-load (TBT proxy sans Lighthouse).
  tbt: number
  long_tasks_count: number
}

/**
 * Mesure la main-thread pressure d'une page via PerformanceObserver
 * sur les entrées `longtask`. Attend 3s après load pour laisser le snippet
 * booter et faire son travail post-idle.
 */
async function collectBlockingMetrics(page: Page): Promise<BlockingMetrics> {
  await page.waitForLoadState("load")
  await page.waitForTimeout(3000)

  return page.evaluate(() => {
    return new Promise<BlockingMetrics>((resolve) => {
      const longTasks: PerformanceEntry[] = []
      try {
        const obs = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) longTasks.push(e)
        })
        obs.observe({ type: "longtask", buffered: true })
        // Laisse l'observer capturer les entries bufferisées
        setTimeout(() => {
          try {
            obs.disconnect()
          } catch {
            /* ignore */
          }
          let tbt = 0
          for (const t of longTasks) {
            // Contribution TBT = max(0, duration - 50ms)
            const contrib = Math.max(0, t.duration - 50)
            tbt += contrib
          }
          resolve({ tbt, long_tasks_count: longTasks.length })
        }, 300)
      } catch {
        resolve({ tbt: 0, long_tasks_count: 0 })
      }
    })
  })
}

test.describe("Phase 3 — Perf gates v2 (Gate 1 hard, Gates 2/3 smoke)", () => {
  // --- Gate 1 — Bundle size (gzip) ---

  test("gate 1 — gzip(korvus.min.js) < 110 KB", () => {
    expect(
      fs.existsSync(SNIPPET_DIST_PATH),
      `snippet dist must exist at ${SNIPPET_DIST_PATH} — run 'cd platform && npm run snippet:build' first`,
    ).toBe(true)

    const raw = fs.readFileSync(SNIPPET_DIST_PATH)
    const gz = gzipSync(raw)
    const rawKb = (raw.length / 1024).toFixed(1)
    const gzKb = (gz.length / 1024).toFixed(1)

    // eslint-disable-next-line no-console
    console.log(
      `[perf gate] korvus.min.js  raw=${rawKb} KB  gzip=${gzKb} KB  limit=110 KB`,
    )

    expect(
      gz.length,
      `gzip(korvus.min.js) should be < 110 KB, got ${gzKb} KB`,
    ).toBeLessThan(MAX_GZIP_BYTES)
  })

  // --- Gate 2 — TBT delta (SMOKE, pas contrat) ---

  test.describe("gate 2 — TBT delta smoke (anti-catastrophe, < 500 ms)", () => {
    test.describe.configure({ retries: 2 })

    test("delta TBT avec/sans snippet (médiane 5 runs) < 500 ms", async ({
      context,
    }) => {
      test.setTimeout(120_000)
      const RUNS = 5

      const withoutTbt: number[] = []
      for (let i = 0; i < RUNS; i++) {
        const p = await context.newPage()
        await blockNativeSnippet(p)
        await p.goto("/products/novapro-x12")
        const m = await collectBlockingMetrics(p)
        withoutTbt.push(m.tbt)
        await p.close()
      }

      const withTbt: number[] = []
      for (let i = 0; i < RUNS; i++) {
        const p = await context.newPage()
        await injectSnippet(p, "doomcheck")
        await p.goto("/products/novapro-x12")
        const m = await collectBlockingMetrics(p)
        withTbt.push(m.tbt)
        await p.close()
      }

      const medWithout = median(withoutTbt)
      const medWith = median(withTbt)
      const delta = medWith - medWithout

      // eslint-disable-next-line no-console
      console.log(
        `[perf gate] TBT median  without=${medWithout.toFixed(1)}ms  with=${medWith.toFixed(1)}ms  delta=${delta.toFixed(1)}ms  (limit ${MAX_TBT_DELTA_MS}ms)`,
      )

      expect(
        delta,
        `TBT delta ${delta.toFixed(1)}ms should be < ${MAX_TBT_DELTA_MS}ms (without median ${medWithout.toFixed(1)}ms, with median ${medWith.toFixed(1)}ms)`,
      ).toBeLessThan(MAX_TBT_DELTA_MS)
    })
  })

  // --- Gate 3 — Long tasks count delta (SMOKE, pas contrat) ---

  test.describe("gate 3 — long tasks delta smoke (anti-catastrophe, ≤ 5)", () => {
    test.describe.configure({ retries: 2 })

    test("delta long tasks avec/sans snippet (médiane 5 runs) ≤ 5", async ({
      context,
    }) => {
      test.setTimeout(120_000)
      const RUNS = 5

      const withoutCount: number[] = []
      for (let i = 0; i < RUNS; i++) {
        const p = await context.newPage()
        await blockNativeSnippet(p)
        await p.goto("/products/novapro-x12")
        const m = await collectBlockingMetrics(p)
        withoutCount.push(m.long_tasks_count)
        await p.close()
      }

      const withCount: number[] = []
      for (let i = 0; i < RUNS; i++) {
        const p = await context.newPage()
        await injectSnippet(p, "doomcheck")
        await p.goto("/products/novapro-x12")
        const m = await collectBlockingMetrics(p)
        withCount.push(m.long_tasks_count)
        await p.close()
      }

      const medWithout = median(withoutCount)
      const medWith = median(withCount)
      const delta = medWith - medWithout

      // eslint-disable-next-line no-console
      console.log(
        `[perf gate] long_tasks median  without=${medWithout}  with=${medWith}  delta=${delta}  (limit ${MAX_LONG_TASKS_DELTA})`,
      )

      expect(
        delta,
        `Long tasks delta ${delta} should be ≤ ${MAX_LONG_TASKS_DELTA} (without median ${medWithout}, with median ${medWith})`,
      ).toBeLessThanOrEqual(MAX_LONG_TASKS_DELTA)
    })
  })
})
