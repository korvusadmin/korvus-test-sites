import { test, expect } from "@playwright/test"
import { IngestInterceptor } from "../helpers/ingest-interceptor"
import { injectSnippet, getSiteConfig } from "../helpers/inject-snippet"

// All tests run on athletedatahub (port 3001)
// Only tests that DIFFER from doomcheck — site-specific behaviors

const adh = getSiteConfig("athletedatahub")

test.describe("ADH — proof capture diagnostic", () => {
  test("serves the proof bundles and configures the probe before the snippet", async ({
    page,
    request,
  }) => {
    const [snippetResponse, proofResponse] = await Promise.all([
      request.get("http://localhost:3001/korvus.min.js"),
      request.get("http://localhost:3001/korvus-proof.min.js"),
    ])

    expect(snippetResponse.ok()).toBe(true)
    expect(proofResponse.ok()).toBe(true)
    expect((await snippetResponse.body()).length).toBeGreaterThan(200_000)
    expect((await proofResponse.body()).length).toBeGreaterThan(80_000)

    let proofChunkRequested = false
    await page.route(
      "https://demo.korvus.fr/korvus-proof.min.js",
      async (route) => {
        proofChunkRequested = true
        await route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: "",
        })
      },
    )
    await page.goto("/?proof-diagnostic=1")
    await expect.poll(() => proofChunkRequested).toBe(true)

    const diagnostic = await page.evaluate(() => {
      const w = window as typeof window & {
        Cookiebot?: { consent?: { statistics?: boolean } }
        __korvus?: {
          endpoint?: string
          enableProofCapture?: boolean
          proofChunkUrl?: string
        }
        __proofProbe?: unknown[]
      }

      return {
        consent: w.Cookiebot?.consent?.statistics,
        endpoint: w.__korvus?.endpoint,
        enabled: w.__korvus?.enableProofCapture,
        chunkUrl: w.__korvus?.proofChunkUrl,
        probeReady: Array.isArray(w.__proofProbe),
      }
    })

    expect(diagnostic).toEqual({
      consent: true,
      endpoint: "https://app.korvus.fr/api/ingest",
      enabled: true,
      chunkUrl: "https://demo.korvus.fr/korvus-proof.min.js",
      probeReady: true,
    })

    await page.goto("/")
    const regularVisit = await page.evaluate(() => {
      const w = window as typeof window & {
        __korvus?: {
          endpoint?: string
          enableProofCapture?: boolean
        }
        __proofProbe?: unknown[]
      }
      return {
        endpoint: w.__korvus?.endpoint,
        enabled: w.__korvus?.enableProofCapture ?? false,
        probeReady: Array.isArray(w.__proofProbe),
      }
    })

    expect(regularVisit).toEqual({
      endpoint: "/api/ingest",
      enabled: false,
      probeReady: false,
    })
  })
})

test.describe("ADH — bilingual storefront", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("adh_cookie_consent", "declined")
    })
  })

  test("French is the default and English persists across PLP and PDP navigation", async ({
    page,
  }) => {
    await page.goto("/")

    await expect(page.getByRole("heading", { name: "Allez plus loin. Équipez-vous juste." })).toBeVisible()
    await expect(page.getByRole("banner").getByRole("link", { name: "Panier" })).toBeVisible()

    await page.getByRole("button", { name: "Switch to English" }).click()
    await expect(page.getByRole("heading", { name: "Go further. Gear up right." })).toBeVisible()
    await expect(page.getByRole("banner").getByRole("link", { name: "Cart" })).toBeVisible()

    await page.getByRole("link", { name: "Shop the collection" }).click()
    await expect(page).toHaveURL(/\/catalog$/)
    await expect(page.getByRole("heading", { name: "All the gear to go further" })).toBeVisible()

    await page.getByRole("link", { name: "Openwater Flex 3/2", exact: true }).first().click()
    await expect(page).toHaveURL(/\/products\/openwater-flex-3-2$/)
    await expect(page.getByRole("heading", { name: "Openwater Flex 3/2" })).toBeVisible()
    await expect(page.getByText("$389.90", { exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Add to Cart" })).toBeVisible()

    await page.reload()
    await expect(page.getByRole("button", { name: "Passer en français" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Openwater Flex 3/2" })).toBeVisible()
  })
})

// Axeptio simulation — athletedatahub's CMP (window.__korvusCMP) is NOT detected by snippet
async function simulateAxeptio(
  page: import("@playwright/test").Page,
  granted: boolean,
): Promise<void> {
  await page.addInitScript((consent: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    w._axcb = []
    w.axeptio_settings = { cookies: { google_analytics: consent } }
  }, granted)
}

// ---------------------------------------------------------------------------
// page_type detection
// ---------------------------------------------------------------------------

test.describe("ADH — page_type detection", () => {
  const cases = [
    { name: "home", path: "/", expected: "home" },
    { name: "pdp (JSON-LD)", path: "/products/pro-training-tshirt-black", expected: "pdp" },
    { name: "plp (URL pattern /catalog)", path: "/catalog", expected: "plp" },
    { name: "search (URL pattern /search)", path: "/search?q=protein", expected: "search" },
    { name: "checkout (URL pattern /checkout)", path: "/checkout", expected: "checkout" },
    { name: "cart (URL pattern /cart)", path: "/cart", expected: "cart" },
  ]

  for (const c of cases) {
    test(`${c.name} → page_type = "${c.expected}"`, async ({ page }) => {
      const interceptor = new IngestInterceptor(page)
      await interceptor.attach()
      await injectSnippet(page, adh)

      await page.goto(c.path)
      await page.waitForTimeout(2000)

      await interceptor.triggerFlush()

      const pageviews = interceptor.getPageviews()
      expect(pageviews.length).toBeGreaterThan(0)
      expect(
        pageviews[0].page_type,
        `${c.path} should be detected as "${c.expected}"`,
      ).toBe(c.expected)
    })
  }
})

// ---------------------------------------------------------------------------
// tag_fired — fake pixels (consent required)
// ---------------------------------------------------------------------------

test.describe("ADH — tag_fired (fake pixels)", () => {
  // V2 — tag_fired est maintenant détecté via interception URL réseau
  // (fetch/XHR contre facebook.com/tr, google-analytics.com/g/collect, etc.),
  // PAS via présence de window.fbq / window.gtag. Cette suite de tests
  // est legacy v1. À réécrire en Phase 2 (nouveau spec checkout/tag).
  test.skip("with consent → detects window.fbq and window.gtag as tag_fired", async ({
    page,
  }) => {
    await simulateAxeptio(page, true)

    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, adh)

    await page.goto("/")
    await page.waitForTimeout(3000)

    await interceptor.triggerFlush()

    const events = interceptor.getEvents("tag_fired")
    expect(
      events.length,
      "tag_fired events should be detected for fake pixels",
    ).toBeGreaterThan(0)

    const tagNames = events.map((e) => e.payload.tag_name)
    expect(
      tagNames.some((t) => String(t).toLowerCase().includes("meta") || String(t).toLowerCase().includes("facebook") || t === "fbq"),
      "Meta/Facebook pixel should be detected via window.fbq",
    ).toBe(true)
    expect(
      tagNames.some((t) => String(t).toLowerCase().includes("google") || String(t).toLowerCase().includes("ga4") || t === "gtag"),
      "Google/GA4 tag should be detected via window.gtag",
    ).toBe(true)
  })

  test.skip("without consent → tag_fired NOT sent", async ({ page }) => {
    // Skip : même raison que le test "with consent" ci-dessus.
    // Le test d'opt-out (consent denied bloque tag_fired) reste valide
    // conceptuellement mais nécessite une refonte du trigger côté test.
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, adh)

    await page.goto("/")
    await page.waitForTimeout(3000)

    await interceptor.triggerFlush()

    const events = interceptor.getEvents("tag_fired")
    expect(
      events.length,
      "tag_fired should NOT be sent without consent",
    ).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// search_performed (exempt)
// ---------------------------------------------------------------------------

test.describe("ADH — search_performed", () => {
  test("search with results → results_count > 0", async ({ page }) => {
    // V2 — search_performed structure (results_count) est exempt, mais
    // search_performed.query est consent-gated. Ce test valide la partie
    // exempt (results_count). La validation de query avec consent granted
    // est couverte dans ecommerce.spec.ts Test 11.
    // Page type "search" est auto-detecte via ?q= dans l URL ; le compteur
    // est lu via la classe wrapper auto-reconnue ".search-results-count".
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, adh)

    await page.goto("/search?q=protein")
    await page.waitForTimeout(2000)

    await interceptor.triggerFlush()

    const events = interceptor.getEvents("search_performed")
    expect(events.length).toBeGreaterThan(0)
    expect(events[0].payload.results_count).toBeGreaterThan(0)
  })

  test("search zero results → results_count = 0", async ({ page }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, adh)

    await page.goto("/search?q=xyzzznotfound")
    await page.waitForTimeout(2000)

    await interceptor.triggerFlush()

    const events = interceptor.getEvents("search_performed")
    expect(events.length).toBeGreaterThan(0)
    expect(events[0].payload.results_count).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Happy path — session utilisateur réaliste chaînée
// ---------------------------------------------------------------------------
//
// Parcours client complet sur athletedatahub avec consent granted :
//  PDP  → ATC click → checkout → payment select → pay click → purchase push
//
// Vérifie que sur une session réaliste multi-étapes, la chaîne d'events v2
// arrive bien bout en bout dans l'ordre attendu, sans dédup trop agressif
// et avec le consent gating correct.

test.describe("ADH — happy path chaîné v2", () => {
  test("PDP → ATC → checkout → payment → purchase : tous les events capturés", async ({
    page,
  }) => {
    test.setTimeout(60_000)

    await simulateAxeptio(page, true)

    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, adh)

    // 1) PDP — pageview pdp + add_to_cart_attempt
    await page.goto("/products/pro-training-tshirt-black")
    await page.waitForTimeout(1500)
    await page.click("button.gap-2")
    await page.waitForTimeout(2500) // attendre la fenêtre ATC attempt

    // 2) Checkout — pageview checkout + payment_method_selected + payment_attempted
    await page.goto("/checkout")
    await page.waitForTimeout(1500)

    // Le checkout ADH n'a pas de UI de payment method par défaut : on
    // injecte un radio + un bouton payer pour simuler un vrai checkout.
    await page.evaluate(() => {
      const main = document.querySelector("main") || document.body
      const wrapper = document.createElement("div")
      wrapper.id = "sim-payment-options"
      wrapper.className = "payment-options"
      const input = document.createElement("input")
      input.type = "radio"
      input.name = "payment_method"
      input.value = "card"
      input.id = "sim-pay-radio"
      const label = document.createElement("label")
      label.htmlFor = input.id
      label.textContent = "Credit card"
      wrapper.appendChild(input)
      wrapper.appendChild(label)
      const payBtn = document.createElement("button")
      payBtn.id = "sim-pay-btn"
      payBtn.type = "button"
      payBtn.textContent = "Payer"
      wrapper.appendChild(payBtn)
      main.appendChild(wrapper)
    })

    await page.check("#sim-pay-radio")
    await page.waitForTimeout(400)
    await page.click("#sim-pay-btn")
    await page.waitForTimeout(600)

    // 3) Purchase via dataLayer (consent required)
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dl = ((window as any).dataLayer ||= [])
      dl.push({
        event: "purchase",
        ecommerce: {
          transaction_id: "TX-ADH-HAPPY-001",
          value: 49.9,
          currency: "EUR",
          items: [
            {
              item_id: "PTTB-001",
              item_name: "Pro Training T-Shirt",
              price: 49.9,
              quantity: 1,
            },
          ],
        },
      })
    })
    await page.waitForTimeout(500)
    await interceptor.triggerFlush()

    // --- Assertions bout en bout ---

    // Pageviews : au moins PDP + checkout
    const pvs = interceptor.getPageviews()
    const pdpPv = pvs.find((p) => p.path.includes("/products/"))
    const checkoutPv = pvs.find((p) => p.path.includes("/checkout"))
    expect(pdpPv, "PDP pageview should be captured").toBeDefined()
    expect(checkoutPv, "Checkout pageview should be captured").toBeDefined()
    expect(pdpPv!.page_type).toBe("pdp")
    expect(checkoutPv!.page_type).toBe("checkout")

    // Events exempts
    const atcAttempts = interceptor.getEvents("add_to_cart_attempt")
    expect(atcAttempts.length, "add_to_cart_attempt should fire").toBeGreaterThan(0)

    const paymentSelected = interceptor.getEvents("payment_method_selected")
    expect(
      paymentSelected.length,
      "payment_method_selected should fire",
    ).toBeGreaterThan(0)
    expect(paymentSelected[0].payload.cascade_matched).toBe("radio_change")

    const paymentAttempted = interceptor.getEvents("payment_attempted")
    expect(
      paymentAttempted.length,
      "payment_attempted should fire on pay click",
    ).toBeGreaterThan(0)

    // Events consent-gated (purchase)
    const purchases = interceptor.getEvents("purchase")
    expect(purchases.length, "purchase should fire").toBeGreaterThan(0)
    expect(purchases[0].payload.transaction_id).toBe("TX-ADH-HAPPY-001")
    expect(purchases[0].payload.value).toBe(49.9)
  })
})

// ---------------------------------------------------------------------------
// dataLayer — datalayer_validation + purchase (consent required)
// ---------------------------------------------------------------------------

test.describe("ADH — dataLayer validation", () => {
  test("manual purchase push → datalayer_validation is_valid: true + purchase event", async ({
    page,
  }) => {
    await simulateAxeptio(page, true)

    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, adh)

    await page.goto("/")
    await page.waitForTimeout(2000)

    // Push a valid purchase to dataLayer
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).dataLayer.push({
        event: "purchase",
        ecommerce: {
          transaction_id: "ADH-TEST-001",
          value: 89.99,
          currency: "USD",
          items: [
            {
              item_id: "1",
              item_name: "Whey Protein",
              price: 89.99,
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
    expect(purchaseValidation).toBeDefined()
    expect(purchaseValidation!.payload.is_valid).toBe(true)

    const purchases = interceptor.getEvents("purchase")
    expect(purchases.length).toBeGreaterThan(0)
    expect(purchases[0].payload.transaction_id).toBe("ADH-TEST-001")
  })

  test("broken purchase (missing fields) → is_valid: false, missing value + transaction_id", async ({
    page,
  }) => {
    await simulateAxeptio(page, true)

    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, adh)

    await page.goto("/")
    await page.waitForTimeout(2000)

    // Simulate broken purchase: missing value and transaction_id
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).dataLayer.push({
        event: "purchase",
        ecommerce: {
          currency: "USD",
          items: [
            {
              item_id: "1",
              item_name: "Whey Protein",
              price: 89.99,
              quantity: 1,
            },
          ],
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
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, adh)

    await page.goto("/")
    await page.waitForTimeout(2000)

    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).dataLayer = (window as any).dataLayer || []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).dataLayer.push({
        event: "purchase",
        ecommerce: {
          transaction_id: "ADH-NOCONSENT",
          value: 50,
          currency: "USD",
          items: [{ item_id: "1", item_name: "Test", price: 50, quantity: 1 }],
        },
      })
    })
    await page.waitForTimeout(500)

    await interceptor.triggerFlush()

    expect(interceptor.getEvents("datalayer_validation").length).toBe(0)
    expect(interceptor.getEvents("purchase").length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Consent — CMP not detected, Axeptio simulation needed
// ---------------------------------------------------------------------------

test.describe("ADH — consent flow", () => {
  test("consent granted → UTMs captured, consent-gated events sent", async ({
    page,
  }) => {
    await simulateAxeptio(page, true)

    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, adh)

    await page.goto("/?utm_source=google&utm_medium=cpc&utm_campaign=adh_test&gclid=test123")
    await page.waitForTimeout(2000)

    await interceptor.triggerFlush()

    const session = interceptor.getSession()
    expect(session).toBeDefined()
    expect(session!.consent_status).toBe("granted")
    expect(session!.utm_source).toBe("google")
    expect(session!.utm_medium).toBe("cpc")
    expect(session!.utm_campaign).toBe("adh_test")
    expect(session!.has_gclid).toBe(true)
  })

  test("consent denied → UTMs absent, consent-gated events blocked", async ({
    page,
  }) => {
    await simulateAxeptio(page, false)

    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, adh)

    await page.goto("/?utm_source=google&utm_medium=cpc&gclid=test123")
    await page.waitForTimeout(2000)

    await interceptor.triggerFlush()

    const session = interceptor.getSession()
    expect(session).toBeDefined()
    expect(session!.consent_status).toBe("denied")
    expect(session!.utm_source).toBeNull()
    expect(session!.utm_medium).toBeNull()
    expect(session!.has_gclid).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Quick-add hors PDP — elargissement gate ATC S2+S3
// ---------------------------------------------------------------------------
//
// La gate ATC est elargie de page_type=pdp seul a pdp+plp+search+home pour
// capter les quick-add depuis les listes (~30% des ATC mid-market perdus en
// gate stricte). Sur ADH (platform=custom), le bouton AddToCartButton porte
// le marker EXPLICIT data-add-to-cart, qui ecoute partout sans risque de
// faux positif heuristique. Ces tests verrouillent la chaine bout-en-bout.

test.describe("ADH — quick-add hors PDP (elargissement gate S2+S3)", () => {
  test("PLP /catalog : click ATC sur ProductCard → add_to_cart_attempt avec page_type=plp", async ({
    page,
  }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, adh)

    await page.goto("/catalog")
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(2000)

    const atcButtons = page.locator("button[data-add-to-cart]")
    await expect(atcButtons.first()).toBeVisible()
    await atcButtons.first().click()

    // PerformanceObserver timeout 2s + flush buffer
    await page.waitForTimeout(2300)
    await interceptor.triggerFlush()

    const events = interceptor.getEvents("add_to_cart_attempt")
    expect(events.length, "exactly 1 add_to_cart_attempt expected").toBe(1)

    const pageviews = interceptor.getPageviews()
    expect(pageviews.length).toBeGreaterThan(0)
    expect(
      pageviews[0].page_type,
      "PLP /catalog should be detected as page_type=plp",
    ).toBe("plp")
  })

  test("home / : click ATC sur featured ProductCard → add_to_cart_attempt avec page_type=home", async ({
    page,
  }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, adh)

    await page.goto("/")
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(2000)

    // Si la home ADH n a pas de featured ATC, skip plutot que fail (le
    // chantier porte sur l infra gate, pas sur la composition home).
    const atcButtons = page.locator("button[data-add-to-cart]")
    const count = await atcButtons.count()
    test.skip(count === 0, "home ADH sans featured ATC — non-regression site, hors chantier")

    await atcButtons.first().click()
    await page.waitForTimeout(2300)
    await interceptor.triggerFlush()

    const events = interceptor.getEvents("add_to_cart_attempt")
    expect(events.length).toBe(1)

    const pageviews = interceptor.getPageviews()
    expect(pageviews[0].page_type).toBe("home")
  })

  test("PLP : click sur bouton anti-pattern (Voir le panier) → AUCUN add_to_cart_attempt", async ({
    page,
  }) => {
    // Sentinelle E2E : un bouton anti-pattern injecte sur la PLP ne doit
    // pas declencher de faux ATC, meme si la gate est elargie.
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, adh)

    await page.goto("/catalog")
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(2000)

    // Injection runtime d un lien "Voir le panier" qui mime un header link.
    // .add-to-cart est dans HEURISTIC, donc desactive sur PLP. Et meme s il
    // matchait, l anti-pattern regex couvre "voir" / "panier" en double.
    await page.evaluate(() => {
      const link = document.createElement("button")
      link.className = "add-to-cart"
      link.setAttribute("aria-label", "Voir mon panier")
      link.textContent = "Voir le panier"
      link.id = "fake-cart-link"
      document.body.appendChild(link)
    })

    await page.locator("#fake-cart-link").click()
    await page.waitForTimeout(2300)
    await interceptor.triggerFlush()

    const events = interceptor.getEvents("add_to_cart_attempt")
    expect(events.length, "anti-pattern button must not emit ATC").toBe(0)
  })
})
