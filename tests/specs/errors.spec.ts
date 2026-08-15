import { test, expect } from "@playwright/test"
import type { Route } from "@playwright/test"
import { IngestInterceptor } from "../helpers/ingest-interceptor"
import { injectSnippet } from "../helpers/inject-snippet"

// All tests run on doomcheck (port 3003) — the only site with chaos engine

// ---------------------------------------------------------------------------
// Test 4 — js_error
// ---------------------------------------------------------------------------

test.describe("Test 4 — js_error", () => {
  test("captures js_error with message, source, lineno, colno, stack", async ({
    page,
  }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")

    await page.goto("/")
    await page.waitForTimeout(500)

    // Inject an uncaught error via setTimeout (triggers window.onerror)
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error("Test snippet error")
      }, 10)
    })
    await page.waitForTimeout(300)

    await interceptor.triggerFlush()

    const events = interceptor.getEvents("js_error")
    const evt = events.find((e) =>
      (e.payload.message as string).includes("Test snippet error"),
    )
    expect(evt, "js_error event should be captured").toBeDefined()
    expect(evt!.payload.message).toContain("Test snippet error")
    expect(evt!.payload).toHaveProperty("source")
    expect(evt!.payload).toHaveProperty("lineno")
    expect(evt!.payload).toHaveProperty("colno")
    expect(evt!.payload).toHaveProperty("stack")
  })

  test("deduplicates 50 identical errors into a single event with count >= 50", async ({
    page,
  }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")

    await page.goto("/")
    await page.waitForTimeout(500)

    await page.evaluate(() => {
      for (let i = 0; i < 50; i++) {
        window.dispatchEvent(new ErrorEvent("error", {
          message: "Repeated test error",
          filename: "test.js",
          lineno: 1,
          colno: 1,
          error: new Error("Repeated test error"),
        }))
      }
    })

    await interceptor.triggerFlush()

    const events = interceptor.getEvents("js_error")
    const deduped = events.filter(
      (e) => e.payload.message === "Repeated test error",
    )
    expect(deduped).toHaveLength(1)
    expect(deduped[0].payload.count).toBeGreaterThanOrEqual(50)
  })

  test("filters browser extension errors (chrome-extension://)", async ({
    page,
  }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")

    await page.goto("/")
    await page.waitForTimeout(500)

    // Inject extension error (should be filtered)
    await page.evaluate(() => {
      window.dispatchEvent(new ErrorEvent("error", {
        message: "Extension error",
        filename: "chrome-extension://abc/script.js",
        lineno: 1,
        colno: 1,
        error: new Error("ext"),
      }))
    })

    // Also inject a valid error to prove the snippet is working
    await page.evaluate(() => {
      window.dispatchEvent(new ErrorEvent("error", {
        message: "Valid error for control",
        filename: "test.js",
        lineno: 1,
        colno: 1,
        error: new Error("valid"),
      }))
    })

    await interceptor.triggerFlush()

    const events = interceptor.getEvents("js_error")
    expect(
      events.some((e) => e.payload.message === "Extension error"),
    ).toBe(false)
    expect(
      events.some((e) => e.payload.message === "Valid error for control"),
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Test 5 — request_error
// ---------------------------------------------------------------------------

test.describe("Test 5 — request_error", () => {
  // Skip sur doomcheck-webkit : meme pattern de flake observe sur 2 des 4
  // runs recents (errors.spec.ts:126 fail intermittent). Dispatch
  // request_error sur racine doomcheck + webkit-desktop est timing-dependent.
  // Moteur WebKit couvert par doomcheck-mobile-safari (iPhone 13).
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name === "doomcheck-webkit",
      "WebKit Desktop + doomcheck root flake; engine couvert par mobile-safari",
    )
  })

  test("captures fetch 500 with status_code", async ({ page }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")

    await page.goto("/")
    await page.waitForTimeout(500)

    await page.evaluate(() => {
      fetch("/api/chaos/error").catch(() => {})
    })
    await page.waitForTimeout(1000)

    await interceptor.triggerFlush()

    const events = interceptor.getEvents("request_error")
    const err500 = events.find((e) =>
      (e.payload.url_path as string).includes("/api/chaos/error"),
    )
    expect(err500, "request_error with 500 should be captured").toBeDefined()
    expect(err500!.payload.status_code).toBe(500)
  })

  test("classifies a status-0 network failure after 10s as timeout", async ({
    page,
  }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")

    await page.goto("/")
    await page.waitForTimeout(500)

    // Keep the request pending while Playwright advances the browser clock.
    // This exercises the real fetch wrapper and collector without paying 10s
    // of wall-clock time on every browser in the CI matrix.
    let releaseNetworkFailure!: () => void
    const networkFailureReleased = new Promise<void>((resolve) => {
      releaseNetworkFailure = resolve
    })
    let markRequestIntercepted!: () => void
    const requestIntercepted = new Promise<void>((resolve) => {
      markRequestIntercepted = resolve
    })
    let markRequestFailed!: () => void
    const requestFailed = new Promise<void>((resolve) => {
      markRequestFailed = resolve
    })

    await page.route("**/api/chaos/timeout", async (route: Route) => {
      markRequestIntercepted()
      await networkFailureReleased
      await route.abort("timedout")
      markRequestFailed()
    })
    await page.clock.install()

    await page.evaluate(() => {
      fetch("/api/chaos/timeout").catch(() => {})
    })
    await requestIntercepted

    await page.clock.fastForward(10_001)
    releaseNetworkFailure()
    await requestFailed
    // Let the fetch rejection propagate through the snippet's chained catch.
    await page.evaluate(
      () => new Promise<void>((resolve) => queueMicrotask(() => queueMicrotask(resolve))),
    )

    await interceptor.triggerFlush()

    const events = interceptor.getEvents("request_error")
    const timeout = events.find((e) =>
      (e.payload.url_path as string).includes("/api/chaos/timeout"),
    )
    expect(timeout, "request_error with timeout should be captured").toBeDefined()
    expect(timeout!.payload.status_code).toBe(0)
    expect(timeout!.payload.duration_ms).toBeGreaterThan(10_000)
    expect(timeout!.payload.error_type).toBe("timeout")
    expect(timeout!.payload.initiator_type).toBe("fetch")
  })

  test("filters analytics domain errors (deny-list)", async ({ page }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")

    // Abort the analytics request so it fails quickly
    await page.route("**google-analytics.com**", (route: Route) =>
      route.abort(),
    )

    await page.goto("/")
    await page.waitForTimeout(500)

    await page.evaluate(() => {
      fetch("https://google-analytics.com/collect").catch(() => {})
    })
    await page.waitForTimeout(1000)

    await interceptor.triggerFlush()

    const events = interceptor.getEvents("request_error")
    const gaErrors = events.filter((e) =>
      (e.payload.url_host as string).includes("google-analytics.com"),
    )
    expect(gaErrors, "Analytics errors should be filtered by deny-list").toHaveLength(0)
  })

  test("original fetch still receives its response", async ({ page }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")

    await page.goto("/")
    await page.waitForTimeout(500)

    const status = await page.evaluate(async () => {
      const res = await fetch("/api/chaos/error")
      return res.status
    })

    expect(status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// Test 6 — resource_error
// ---------------------------------------------------------------------------

test.describe("Test 6 — resource_error", () => {
  // Skip tout le describe sur doomcheck-webkit : flake reproductible du
  // dispatch ErrorEvent sur la racine doomcheck Next.js (LCP hero image +
  // GTM + ChaosEngine timing-fight avec le snippet boot). Probes Playwright
  // multi-browser ont confirme que WebKit capture correctement l'ErrorEvent
  // pour <script>/<link>/<img> 404 hors de ce contexte (snippet reel +
  // scenario addInitScript sur page minimaliste). Le moteur WebKit reste
  // couvert par doomcheck-mobile-safari (iPhone 13, meme engine) qui passe
  // les 4 tests du describe.
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name === "doomcheck-webkit",
      "WebKit Desktop + doomcheck root flake; engine couvert par mobile-safari",
    )
  })

  test("captures broken script (tag SCRIPT)", async ({ page }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")

    await page.goto("/")
    await page.waitForTimeout(500)

    await page.evaluate(() => {
      const script = document.createElement("script")
      script.src = "/nonexistent-test-chaos.js"
      document.head.appendChild(script)
    })
    await page.waitForTimeout(1000)

    await interceptor.triggerFlush()

    const events = interceptor.getEvents("resource_error")
    const scriptErr = events.find(
      (e) =>
        e.payload.tag === "SCRIPT" &&
        (e.payload.url_path as string).includes("nonexistent-test-chaos.js"),
    )
    expect(scriptErr, "resource_error for SCRIPT should be captured").toBeDefined()
  })

  test("captures broken CSS link (tag LINK)", async ({ page }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")

    await page.goto("/")
    await page.waitForTimeout(500)

    await page.evaluate(() => {
      const link = document.createElement("link")
      link.rel = "stylesheet"
      link.href = "/nonexistent-test-chaos.css"
      document.head.appendChild(link)
    })
    await page.waitForTimeout(1000)

    await interceptor.triggerFlush()

    const events = interceptor.getEvents("resource_error")
    const cssErr = events.find(
      (e) =>
        e.payload.tag === "LINK" &&
        (e.payload.url_path as string).includes("nonexistent-test-chaos.css"),
    )
    expect(cssErr, "resource_error for LINK should be captured").toBeDefined()
  })

  test("captures broken image (tag IMG)", async ({ page }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")

    await page.goto("/")
    await page.waitForTimeout(500)

    await page.evaluate(() => {
      const img = document.createElement("img")
      img.src = "/nonexistent-test-chaos.jpg"
      document.body.appendChild(img)
    })
    await page.waitForTimeout(1000)

    await interceptor.triggerFlush()

    const events = interceptor.getEvents("resource_error")
    const imgErr = events.find(
      (e) =>
        e.payload.tag === "IMG" &&
        (e.payload.url_path as string).includes("nonexistent-test-chaos.jpg"),
    )
    expect(imgErr, "resource_error for IMG should be captured").toBeDefined()
  })

  test("filters deny-listed domain (connect.facebook.net)", async ({
    page,
  }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")

    // Abort the facebook request so the error event fires quickly
    await page.route("**facebook.net**", (route: Route) => route.abort())

    await page.goto("/")
    await page.waitForTimeout(500)

    // Inject deny-listed image (should be filtered)
    await page.evaluate(() => {
      const img = document.createElement("img")
      img.src = "https://connect.facebook.net/fake.png"
      document.body.appendChild(img)
    })

    // Also inject a valid broken image to prove the collector works
    await page.evaluate(() => {
      const img = document.createElement("img")
      img.src = "/valid-broken-control.jpg"
      document.body.appendChild(img)
    })
    await page.waitForTimeout(1000)

    await interceptor.triggerFlush()

    const events = interceptor.getEvents("resource_error")
    expect(
      events.some((e) => (e.payload.url_host as string).includes("facebook.net")),
    ).toBe(false)
    expect(
      events.some((e) =>
        (e.payload.url_path as string).includes("valid-broken-control.jpg"),
      ),
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Test 7 — ux_error
// ---------------------------------------------------------------------------

test.describe("Test 7 — ux_error", () => {
  test("captures visible alert div with text and selector", async ({
    page,
  }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")

    await page.goto("/")
    await page.waitForTimeout(500)

    await page.evaluate(() => {
      const div = document.createElement("div")
      div.className = "alert alert-danger"
      div.setAttribute("role", "alert")
      div.textContent = "Une erreur est survenue, veuillez réessayer"
      document.body.appendChild(div)
    })
    await page.waitForTimeout(500)

    await interceptor.triggerFlush()

    const events = interceptor.getEvents("ux_error")
    const alert = events.find((e) =>
      (e.payload.text as string).includes("Une erreur est survenue"),
    )
    expect(alert, "ux_error should be captured for visible alert").toBeDefined()
    expect(alert!.payload.selector).toBeTruthy()
  })

  test("ignores hidden alert (display: none)", async ({ page }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")

    await page.goto("/")
    await page.waitForTimeout(500)

    // Inject hidden alert (should be filtered)
    await page.evaluate(() => {
      const div = document.createElement("div")
      div.className = "alert alert-danger"
      div.style.display = "none"
      div.textContent = "Hidden error message"
      document.body.appendChild(div)
    })

    // Also inject a visible one to prove the collector works
    await page.evaluate(() => {
      const div = document.createElement("div")
      div.className = "alert alert-danger"
      div.textContent = "Visible control error"
      document.body.appendChild(div)
    })
    await page.waitForTimeout(500)

    await interceptor.triggerFlush()

    const events = interceptor.getEvents("ux_error")
    expect(
      events.some((e) =>
        (e.payload.text as string).includes("Hidden error message"),
      ),
    ).toBe(false)
    expect(
      events.some((e) =>
        (e.payload.text as string).includes("Visible control error"),
      ),
    ).toBe(true)
  })

  test("captures element with role='alert'", async ({ page }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")

    await page.goto("/")
    await page.waitForTimeout(500)

    await page.evaluate(() => {
      const span = document.createElement("span")
      span.setAttribute("role", "alert")
      span.textContent = "Payment failed, please retry"
      document.body.appendChild(span)
    })
    await page.waitForTimeout(500)

    await interceptor.triggerFlush()

    const events = interceptor.getEvents("ux_error")
    const roleAlert = events.find((e) =>
      (e.payload.text as string).includes("Payment failed"),
    )
    expect(roleAlert, "ux_error should capture role='alert' elements").toBeDefined()
  })
})
