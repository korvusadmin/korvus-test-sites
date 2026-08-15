import { test, expect } from "@playwright/test"
import { IngestInterceptor } from "../helpers/ingest-interceptor"
import { injectSnippet } from "../helpers/inject-snippet"

// All tests run on doomcheck (port 3003)

// 440 garde le message sous la limite ingest de 500 caracteres tout en
// garantissant > 48 KB meme sous WebKit, dont les stacks sont plus courtes.
const OVERFLOW_MESSAGE_FILLER = "x".repeat(440)

function overflowMessage(index: number): string {
  return `Overflow error ${index} ${OVERFLOW_MESSAGE_FILLER}`
}

// ---------------------------------------------------------------------------
// Test 19 — Batching
// ---------------------------------------------------------------------------

test.describe("Test 19 — Batching", () => {
  test("no batch before ~30s, batch arrives at 30s timer", async ({
    page,
  }) => {
    test.setTimeout(50_000)

    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")

    await page.goto("/")
    await page.waitForTimeout(500)

    // Generate a few events (do NOT use triggerFlush)
    await page.evaluate(() => {
      for (let i = 0; i < 3; i++) {
        window.dispatchEvent(new ErrorEvent("error", {
          message: `Batch timer error ${i}`,
          filename: "test.js",
          lineno: 1,
          colno: 1,
          error: new Error(`Batch timer error ${i}`),
        }))
      }
    })

    // After 5s, no batch should have been sent yet
    await page.waitForTimeout(5000)
    expect(
      interceptor.getBatchCount(),
      "No batch should be sent before the 30s interval",
    ).toBe(0)

    // Wait for the natural 30s flush (default waitForBatch timeout = 35s)
    const batch = await interceptor.waitForBatch()
    expect(batch, "Batch should arrive at the 30s interval").toBeDefined()
    expect(batch.events.length).toBeGreaterThan(0)
  })

  test("visibilitychange flush sends batch immediately", async ({ page }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")

    await page.goto("/")
    await page.waitForTimeout(500)

    // Generate events
    await page.evaluate(() => {
      for (let i = 0; i < 3; i++) {
        window.dispatchEvent(new ErrorEvent("error", {
          message: `Visibility flush error ${i}`,
          filename: "test.js",
          lineno: 1,
          colno: 1,
          error: new Error(`Visibility flush error ${i}`),
        }))
      }
    })

    // Trigger flush via visibilitychange (simulated by triggerFlush)
    await interceptor.triggerFlush()

    // Batch should have arrived immediately
    expect(interceptor.getBatchCount()).toBeGreaterThan(0)
    const events = interceptor.getEvents("js_error")
    const ours = events.filter((e) =>
      (e.payload.message as string).startsWith("Visibility flush error"),
    )
    expect(ours.length).toBeGreaterThanOrEqual(3)
  })

  // Phase 7 C1 — pagehide flush sends batch immediately.
  // Couvre les cas que visibilitychange ne couvre pas de façon fiable :
  // Safari iOS swipe-back, WKWebView, bfcache entry, tab close.
  // visibilitychange reste en place pour le cas tab-switch où pagehide ne
  // fire pas — ce test valide que pagehide AJOUTE une couverture sans
  // remplacer.
  test("pagehide flush sends batch immediately (Phase 7 C1)", async ({
    page,
  }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")

    await page.goto("/")
    await page.waitForTimeout(500)

    // Generate events — ne pas trigger visibilitychange, on veut PROUVER
    // que pagehide seul est suffisant pour flush.
    await page.evaluate(() => {
      for (let i = 0; i < 3; i++) {
        window.dispatchEvent(new ErrorEvent("error", {
          message: `Pagehide flush error ${i}`,
          filename: "test.js",
          lineno: 1,
          colno: 1,
          error: new Error(`Pagehide flush error ${i}`),
        }))
      }
    })

    // Fire pagehide sans toucher à visibilityState. Safari iOS fait ça lors
    // d'un swipe-back : la page part en bfcache, pagehide fire, la visibility
    // peut encore être "visible" à cet instant.
    await page.evaluate(() => {
      const evt = new Event("pagehide")
      window.dispatchEvent(evt)
    })

    // Petit tick pour laisser fetch keepalive partir et l'interceptor recevoir.
    await page.waitForTimeout(300)

    // Batch should have arrived via pagehide handler.
    expect(
      interceptor.getBatchCount(),
      "pagehide listener should flush the buffer like visibilitychange",
    ).toBeGreaterThan(0)
    const events = interceptor.getEvents("js_error")
    const ours = events.filter((e) =>
      (e.payload.message as string).startsWith("Pagehide flush error"),
    )
    expect(
      ours.length,
      "all 3 events dispatched before pagehide should be in the flushed batch",
    ).toBeGreaterThanOrEqual(3)
  })

  // Phase 7 C1 — idempotence : si visibilitychange ET pagehide firent tous
  // les deux (cas fréquent : tab close → les deux events firent), le 2e
  // handler trouve un buffer vide et no-op. Pas de double envoi, pas de
  // crash.
  test("visibilitychange + pagehide firing together is idempotent", async ({
    page,
  }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")

    await page.goto("/")
    await page.waitForTimeout(500)

    await page.evaluate(() => {
      window.dispatchEvent(new ErrorEvent("error", {
        message: "Double-flush error",
        filename: "test.js",
        lineno: 1,
        colno: 1,
        error: new Error("Double-flush error"),
      }))
    })

    // Fire les deux events dans la même tick, comme le navigateur le ferait
    // sur un tab close ou une navigation.
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        writable: true,
        configurable: true,
      })
      document.dispatchEvent(new Event("visibilitychange"))
      window.dispatchEvent(new Event("pagehide"))
    })

    await page.waitForTimeout(300)

    // Exactement 1 batch. Si le 2e handler tentait un send sur un buffer
    // non-vide, on aurait 2 batches avec le même contenu.
    expect(
      interceptor.getBatchCount(),
      "double flush (visibilitychange + pagehide) should produce 1 batch, not 2",
    ).toBe(1)
    const events = interceptor.getEvents("js_error")
    const ours = events.filter(
      (e) => e.payload.message === "Double-flush error",
    )
    expect(ours.length, "error should appear exactly once").toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Test 20 — Buffer overflow
// ---------------------------------------------------------------------------

test.describe("Test 20 — Buffer overflow", () => {
  // Regression garde du bug keepalive 64 KB (PR #100) : un flush > ~64 KB etait
  // chunke et tous les chunks partaient en fetch(keepalive:true) simultanes ->
  // budget keepalive GLOBAL navigateur depasse -> seul le 1er chunk passait,
  // le reste perdu en silence. L'ancienne assertion `events.length <= 100`
  // (cap reel = 50) ne testait RIEN -> le bug vivait derriere un test vert.
  //
  // Invariant fort teste ici : un gros flush (50 events distincts > 48 KB,
  // bien au-dessus du budget keepalive 48 KB) livre les 50 plus recents
  // (fenetre [100..149]) avec ZERO perte et ZERO doublon, et ne laisse rien
  // dans la retry queue. Le flush anticipe (4.B) peut en plus rescuer des
  // events plus anciens (pre-cap) -> le total peut depasser 50, c'est
  // attendu ; ce qui ne doit JAMAIS arriver c'est de perdre un event de la
  // fenetre finale.
  test("gros flush — livre les 50 events les plus recents avec 0 perte (garde keepalive 64 KB)", async ({
    page,
    browserName,
  }) => {
    test.setTimeout(60_000)
    // Firefox : keepalive est ignore (deja plain fetch) -> ce projet ne teste
    // PAS le chemin critique keepalive, et le tear-down route/synthetic
    // ErrorEvent y est instable. Le chemin keepalive est valide sur
    // Chromium + WebKit (desktop & mobile). Cf. garde unit
    // platform/tests/unit/snippet/transport-batch-contract.test.ts.
    test.skip(
      browserName === "firefox",
      "Firefox: keepalive ignore (plain fetch) — ne teste pas le chemin critique ; couvert Chromium/WebKit + unit",
    )

    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")

    await page.goto("/")
    await page.waitForTimeout(500)

    // Le flush anticipe a 40 KB est volontairement desactive sur page cachee :
    // c'est le vrai scenario unload que ce test doit couvrir. Le flush final
    // devra donc decouper le batch sous KEEPALIVE_BUDGET=48 KB.
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        writable: true,
        configurable: true,
      })
    })

    // 150 erreurs DISTINCTES et realistes (message < 500 caracteres, la borne
    // du schema ingest). Le cap MAX_EVENTS=50 garde les 50 plus recentes =
    // [100..149], dont le payload cumule depasse deterministement 48 KB.
    await page.evaluate((filler) => {
      for (let i = 0; i < 150; i++) {
        const message = `Overflow error ${i} ${filler}`
        window.dispatchEvent(
          new ErrorEvent("error", {
            message,
            filename: "test.js",
            lineno: i,
            colno: 0,
            error: new Error(message),
          }),
        )
      }
    }, OVERFLOW_MESSAGE_FILLER)

    // Flush final : visibilitychange -> hidden (le snippet flush le buffer).
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        writable: true,
        configurable: true,
      })
      document.dispatchEvent(new Event("visibilitychange"))
    })

    // Attente DETERMINISTE : on attend que les 50 events de la fenetre finale
    // soient tous arrives (chunks multiples inclus), pas un sleep arbitraire.
    const windowMessages = Array.from(
      { length: 50 },
      (_, k) => overflowMessage(100 + k),
    )
    await interceptor.waitForEventMessages(windowMessages, 20_000)

    const events = interceptor.getEvents()
    const messages = events.map((e) => e.payload.message as string)

    // 1) ZERO perte : tous les events [100..149] sont presents.
    for (let i = 100; i < 150; i++) {
      expect(
        messages,
        `event "Overflow error ${i}" doit etre present (0 perte sur la fenetre finale)`,
      ).toContain(overflowMessage(i))
    }

    // 2) ZERO doublon : chaque event de la fenetre arrive exactement une fois
    // (pas de double-send entre chunks / retry).
    for (let i = 100; i < 150; i++) {
      const msg = overflowMessage(i)
      expect(
        messages.filter((m) => m === msg).length,
        `event "${msg}" ne doit arriver qu'une fois`,
      ).toBe(1)
    }

    // 3) La retry queue est vide -> rien n'a ete perdu/coince en transit.
    const retryQueueEvents = await page.evaluate(() => {
      try {
        const raw = sessionStorage.getItem("korvus_retry_v1")
        if (!raw) return 0
        const q = JSON.parse(raw) as Array<{
          batch?: { events?: unknown[] }
        }>
        return q.reduce((n, e) => n + (e.batch?.events?.length ?? 0), 0)
      } catch {
        return -1
      }
    })
    expect(retryQueueEvents, "retry queue doit etre vide apres flush").toBe(0)

    // 4) Robustesse anti-vacuite (4.F.4) : le payload logique doit depasser
    // 48 KB ET arriver dans plusieurs POST, chacun sous le budget. Mesurer les
    // requetes capturees prouve le chemin de decoupe, pas seulement la taille
    // theorique des events avant leur enveloppe reseau.
    const windowBytes = events
      .filter((e) => windowMessages.includes(e.payload.message as string))
      .reduce((sum, e) => sum + JSON.stringify(e).length, 0)
    expect(
      windowBytes,
      "la fenetre [100..149] doit depasser le budget keepalive (sinon le test n'exerce plus l'overflow)",
    ).toBeGreaterThan(48_000)

    const overflowBatches = interceptor.getAllBatches().filter((batch) =>
      batch.events.some((event) =>
        windowMessages.includes(event.payload.message as string),
      ),
    )
    expect(
      overflowBatches.length,
      "le payload overflow doit etre decoupe en plusieurs POST",
    ).toBeGreaterThan(1)
    for (const batch of overflowBatches) {
      expect(
        new Blob([JSON.stringify(batch)]).size,
        "chaque POST decoupe doit respecter KEEPALIVE_BUDGET",
      ).toBeLessThanOrEqual(48_000)
    }
  })
})

// ---------------------------------------------------------------------------
// Test 21 — Inactivité (idle detection after 30 min)
// ---------------------------------------------------------------------------

test.describe("Test 21 — Inactivité", () => {
  // This test requires 31+ minutes — too long for CI.
  // Run manually: npx playwright test --project=doomcheck batching.spec.ts -g "Inactivité"
  test.skip("stops collection after 30 min idle, resumes on interaction", async ({
    page,
  }) => {
    test.setTimeout(35 * 60 * 1000)

    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")

    await page.goto("/")
    await page.waitForTimeout(500)

    // Wait 31 minutes without any interaction
    interceptor.clear()
    await page.waitForTimeout(31 * 60 * 1000)

    // After idle timeout, no new events should be sent
    // (the 30s flush timer is stopped by idle detection)
    expect(
      interceptor.getBatchCount(),
      "No batches should be sent during idle period",
    ).toBe(0)

    // Simulate interaction to resume
    await page.mouse.move(100, 100)
    await page.waitForTimeout(2000)

    // Generate an event after resume
    await page.evaluate(() => {
      window.dispatchEvent(new ErrorEvent("error", {
        message: "Post-idle error",
        filename: "test.js",
        lineno: 1,
        colno: 1,
        error: new Error("Post-idle error"),
      }))
    })

    await interceptor.triggerFlush()

    const events = interceptor.getEvents("js_error")
    expect(
      events.some((e) => e.payload.message === "Post-idle error"),
      "Collection should resume after interaction",
    ).toBe(true)
  })
})
