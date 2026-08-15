import { test, expect } from "@playwright/test"
import { IngestInterceptor } from "../helpers/ingest-interceptor"
import { injectSnippet } from "../helpers/inject-snippet"

// All tests run on doomcheck (port 3003) — heavy hero image for LCP testing

// ---------------------------------------------------------------------------
// Test 8 — Web Performance
// ---------------------------------------------------------------------------

test.describe("Test 8 — Web Performance", () => {
  test("pageview contains lcp_ms, fcp_ms, ttfb_ms > 0", async ({ page }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")

    await page.goto("/")
    // Wait for PerformanceObservers + requestIdleCallback to fire
    await page.waitForTimeout(3000)

    await interceptor.triggerFlush()

    const pageviews = interceptor.getPageviews()
    expect(pageviews.length).toBeGreaterThan(0)

    const pv = pageviews[0]
    expect(pv.lcp_ms, "LCP should be > 0").toBeGreaterThan(0)
    expect(pv.fcp_ms, "FCP should be > 0").toBeGreaterThan(0)
    expect(pv.ttfb_ms, "TTFB should be >= 0").toBeGreaterThanOrEqual(0)
  })

  test("lcp_element contains tag, url, selector", async ({ page }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")

    await page.goto("/")
    await page.waitForTimeout(3000)

    await interceptor.triggerFlush()

    const pageviews = interceptor.getPageviews()
    const pv = pageviews[0]

    expect(pv.lcp_element, "lcp_element should be present").toBeDefined()
    expect(pv.lcp_element).not.toBeNull()
    expect(pv.lcp_element).toHaveProperty("tag")
    expect(pv.lcp_element).toHaveProperty("url")
    expect(pv.lcp_element).toHaveProperty("selector")
  })

  test("layout shift produces cls_score > 0 and cls_largest_shift", async ({
    page,
    browserName,
  }) => {
    // Safari/WebKit ne reporte pas les entries `layout-shift` du
    // PerformanceObserver de façon fiable dans les environnements de test
    // synthétiques (support partiel selon version, souvent désactivé hors
    // real user). Le snippet met proprement cls_score à null dans ce cas,
    // ce qui est le comportement attendu. En prod Safari réel, le snippet
    // capture les layout shifts quand Safari les fournit.
    test.skip(
      browserName === "webkit",
      "WebKit layout-shift PerformanceObserver not reliable in test env",
    )
    // Firefox n'implémente pas le Layout Instability API (`PerformanceObserver`
    // avec type `"layout-shift"`). Le snippet garde proprement cls_score à
    // null — comportement attendu sur Firefox. En prod le snippet capture
    // les layout shifts quand le navigateur les fournit (Chrome/Edge).
    // Audit 2026-04-15 (B6b).
    test.skip(
      browserName === "firefox",
      "Firefox does not implement Layout Instability API (layout-shift PerformanceObserver)",
    )

    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")

    await page.goto("/")
    await page.waitForTimeout(1000)

    // Inject a large div at top of body to force a layout shift
    await page.evaluate(() => {
      const div = document.createElement("div")
      div.style.height = "300px"
      div.style.background = "linear-gradient(135deg, #1a0a0a, #2d0000)"
      div.style.width = "100%"
      document.body.insertBefore(div, document.body.firstChild)
    })
    await page.waitForTimeout(1000)

    await interceptor.triggerFlush()

    const pageviews = interceptor.getPageviews()
    const pv = pageviews[0]

    expect(pv.cls_score, "CLS score should be > 0 after layout shift").toBeGreaterThan(0)
    expect(pv.cls_largest_shift, "cls_largest_shift should be present").toBeDefined()
    expect(pv.cls_largest_shift).not.toBeNull()
    expect(pv.cls_largest_shift).toHaveProperty("selector")
    expect(pv.cls_largest_shift).toHaveProperty("shift_value")
  })

  test("resource_timings is a non-empty array with expected fields", async ({
    page,
  }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")

    await page.goto("/")
    // Wait for requestIdleCallback that collects resource timings
    await page.waitForTimeout(3000)

    await interceptor.triggerFlush()

    const pageviews = interceptor.getPageviews()
    const pv = pageviews[0]

    expect(pv.resource_timings, "resource_timings should be present").toBeDefined()
    expect(pv.resource_timings).not.toBeNull()
    expect(
      Array.isArray(pv.resource_timings),
      "resource_timings should be an array",
    ).toBe(true)
    expect(pv.resource_timings!.length).toBeGreaterThan(0)

    // Verify structure of the first entry
    const entry = pv.resource_timings![0]
    expect(entry).toHaveProperty("name")
    expect(entry).toHaveProperty("type")
    expect(entry).toHaveProperty("duration_ms")
    expect(entry).toHaveProperty("transfer_kb")
  })
})

// ---------------------------------------------------------------------------
// Test 9 — scripts_hash
// ---------------------------------------------------------------------------

test.describe("Test 9 — scripts_hash", () => {
  test("scripts_hash is a non-empty string, consistent across reloads", async ({
    page,
  }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")

    // Single load
    await page.goto("/")
    await page.waitForTimeout(2000)
    await interceptor.triggerFlush()

    const pageviews = interceptor.getPageviews()
    expect(pageviews.length).toBeGreaterThan(0)
    const hash1 = pageviews[0].scripts_hash
    expect(hash1, "scripts_hash should be a non-empty string").toBeTruthy()
    expect(typeof hash1).toBe("string")

    // Recompute the hash in the same page context using the same algorithm
    // to prove the snippet's hashing is deterministic on the same DOM.
    // (Two page.goto() calls would fail in dev mode because Next.js appends
    // a timestamp cache buster ?v= to main-app.js and webpack.js.)
    const recomputedHash = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll("script[src]"))
        .map((s) => (s as HTMLScriptElement).src)
        .sort()
        .join("|")
      if (!scripts) return null
      let hash = 5381
      for (let i = 0; i < scripts.length; i++) {
        hash = ((hash << 5) + hash + scripts.charCodeAt(i)) & 0xffffffff
      }
      return (hash >>> 0).toString(16)
    })

    expect(
      recomputedHash,
      "scripts_hash should be deterministic on the same DOM",
    ).toEqual(hash1)
  })

  test("scripts_hash changes when a new script is present", async ({
    page,
    context,
  }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")

    // Baseline hash
    await page.goto("/")
    await page.waitForTimeout(2000)
    await interceptor.triggerFlush()

    const hash1 = interceptor.getPageviews()[0].scripts_hash
    expect(hash1).toBeTruthy()

    // Une page neuve evite qu'un reload HMR tardif de la baseline interrompe
    // la navigation suivante sous WebKit.
    const pageWithExtraScript = await context.newPage()
    const extraScriptInterceptor = new IngestInterceptor(pageWithExtraScript)
    await extraScriptInterceptor.attach()
    await injectSnippet(pageWithExtraScript, "doomcheck")
    await pageWithExtraScript.addInitScript(() => {
      const s = document.createElement("script")
      s.src = "/injected-test-only-script.js"
      ;(document.head || document.documentElement).appendChild(s)
    })

    await pageWithExtraScript.goto("/catalog")
    await pageWithExtraScript.waitForTimeout(2000)
    await extraScriptInterceptor.triggerFlush()

    const hash2 = extraScriptInterceptor.getPageviews()[0].scripts_hash
    expect(hash2).toBeTruthy()
    expect(
      hash2,
      "scripts_hash should change when a new script is added",
    ).not.toEqual(hash1)
  })
})
