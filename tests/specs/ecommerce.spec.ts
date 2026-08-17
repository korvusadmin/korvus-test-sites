import { test, expect } from "@playwright/test"
import { IngestInterceptor } from "../helpers/ingest-interceptor"
import { injectSnippet, getSiteConfig } from "../helpers/inject-snippet"

// All tests run on doomcheck (port 3003)

const doomcheck = getSiteConfig("doomcheck")

// ---------------------------------------------------------------------------
// Test 10 — add_to_cart_attempt (exempt)
// ---------------------------------------------------------------------------

test.describe("Test 10 — add_to_cart_attempt", () => {
  test("captures ATC click on PDP", async ({ page }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, doomcheck)

    await page.goto("/products/novapro-x12")
    await page.waitForTimeout(1500)

    // Click the ATC button
    await page.click("button.gap-2")
    // Wait for the 2s PerformanceObserver timeout to fire
    await page.waitForTimeout(2500)

    await interceptor.triggerFlush()

    const events = interceptor.getEvents("add_to_cart_attempt")
    expect(events.length, "add_to_cart_attempt should be captured").toBeGreaterThan(0)

    const evt = events[0]
    expect(evt.payload).toHaveProperty("success")
    expect(evt.payload.page_url).toContain("/products/novapro-x12")
  })

  test("success: false when no cart endpoint request detected", async ({
    page,
  }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, doomcheck)

    await page.goto("/products/novapro-x12")
    await page.waitForTimeout(1500)

    // Click ATC — doomcheck only writes to localStorage, no network request
    await page.click("button.gap-2")
    await page.waitForTimeout(2500)

    await interceptor.triggerFlush()

    const events = interceptor.getEvents("add_to_cart_attempt")
    expect(events.length).toBeGreaterThan(0)
    expect(events[0].payload.success).toBe(false)
  })
})

test.describe("Test 14 — datalayer_validation", () => {
  test("valid purchase push → is_valid: true", async ({ page }) => {
    // Simulate Axeptio consent GRANTED before snippet boots
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      w._axcb = []
      w.axeptio_settings = { cookies: { google_analytics: true } }
    })

    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, doomcheck)

    await page.goto("/")
    await page.waitForTimeout(2000)

    // Push a valid purchase event to dataLayer
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).dataLayer.push({
        event: "purchase",
        ecommerce: {
          transaction_id: "TX-TEST-001",
          value: 449,
          currency: "EUR",
          items: [
            {
              item_id: "1",
              item_name: "NovaPro X12",
              price: 449,
              quantity: 1,
            },
          ],
        },
      })
    })
    await page.waitForTimeout(500)

    await interceptor.triggerFlush()

    const validations = interceptor.getEvents("datalayer_validation")
    const purchaseValidation = validations.find(
      (e) => e.payload.event_name === "purchase",
    )
    expect(
      purchaseValidation,
      "datalayer_validation for purchase should be captured",
    ).toBeDefined()
    expect(purchaseValidation!.payload.is_valid).toBe(true)
    expect(purchaseValidation!.payload.missing_fields).toEqual([])

    // purchase enriched event should also be emitted
    const purchases = interceptor.getEvents("purchase")
    expect(purchases.length).toBeGreaterThan(0)
    expect(purchases[0].payload.transaction_id).toBe("TX-TEST-001")
    expect(purchases[0].payload.value).toBe(449)
  })

  test("purchase without value → is_valid: false, missing_fields includes value", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      w._axcb = []
      w.axeptio_settings = { cookies: { google_analytics: true } }
    })

    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, doomcheck)

    await page.goto("/")
    await page.waitForTimeout(2000)

    // Push a broken purchase event (missing value and transaction_id)
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).dataLayer.push({
        event: "purchase",
        ecommerce: {
          currency: "EUR",
          items: [{ item_id: "1", item_name: "Test", price: 10, quantity: 1 }],
        },
      })
    })
    await page.waitForTimeout(500)

    await interceptor.triggerFlush()

    const validations = interceptor.getEvents("datalayer_validation")
    const broken = validations.find(
      (e) => e.payload.event_name === "purchase",
    )
    expect(broken, "broken purchase validation should be captured").toBeDefined()
    expect(broken!.payload.is_valid).toBe(false)
    const missing = broken!.payload.missing_fields as string[]
    expect(missing).toContain("value")
    expect(missing).toContain("transaction_id")
  })

  test("without consent → datalayer_validation NOT sent", async ({ page }) => {
    // No Axeptio simulation → consent stays "unknown" (not granted)
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, doomcheck)

    await page.goto("/")
    await page.waitForTimeout(2000)

    // Push purchase event — should be ignored since dataLayer collector is not initialized
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).dataLayer.push({
        event: "purchase",
        ecommerce: {
          transaction_id: "TX-NOCONSENT",
          value: 100,
          currency: "EUR",
          items: [{ item_id: "1", item_name: "Test", price: 100, quantity: 1 }],
        },
      })
    })
    await page.waitForTimeout(500)

    await interceptor.triggerFlush()

    const validations = interceptor.getEvents("datalayer_validation")
    expect(
      validations.length,
      "datalayer_validation should NOT be sent without consent",
    ).toBe(0)

    const purchases = interceptor.getEvents("purchase")
    expect(
      purchases.length,
      "purchase event should NOT be sent without consent",
    ).toBe(0)
  })
})
