import { test, expect, type Page } from "@playwright/test"
import { IngestInterceptor } from "../helpers/ingest-interceptor"
import { injectSnippet, getSiteConfig } from "../helpers/inject-snippet"

// All tests run on athletedatahub (port 3001)
// Only tests that DIFFER from doomcheck — site-specific behaviors

const adh = getSiteConfig("athletedatahub")

async function gotoAfterDevReload(page: Page, url: string): Promise<void> {
  const expectedUrl = new URL(url, page.url()).href
  // Next dev peut imposer un unique full reload lorsqu'un autre worker vient
  // de compiler une route. WebKit refuse alors la navigation concurrente. On
  // ne tolere que cette fenetre d'infrastructure : chaque tentative doit finir
  // exactement sur l'URL demandee, dans une borne courte.
  await expect(async () => {
    await page.goto(url)
    expect(page.url()).toBe(expectedUrl)
  }).toPass({ timeout: 10_000, intervals: [250, 500, 1_000] })
}

test.describe("ADH — proof capture diagnostic", () => {
  test("serves the proof bundles and configures the probe before the snippet", async ({
    page,
    context,
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

    // Une page neuve isole la visite reguliere du reload HMR que Next dev peut
    // encore terminer sur la page diagnostic, surtout sous WebKit.
    const regularPage = await context.newPage()
    await regularPage.goto("/")
    const regularVisit = await regularPage.evaluate(() => {
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

// ---------------------------------------------------------------------------
// Modes de demo : ?bug= (pannes jouables) et ?film= (contexte de tournage)
//
// Ces deux parametres existent pour produire les preuves video commerciales.
// Le contrat que ce bloc verrouille tient en une phrase : ils sont OPT-IN, et
// une visite sans parametre voit un site strictement sain. Un bug actif par
// defaut casserait le happy path chaine, le quick-add hors PDP et la vitrine
// bilingue -- en chromium ET en webkit, donc six echecs pour une regression.
// ---------------------------------------------------------------------------

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PINNED_SID = "435b8f99-e523-4b27-95ff-ead084fb2333"

/** Reimplemente djb2Hash (snippet/src/url-sanitizer.ts) pour verifier le tirage. */
function djb2(input: string): number {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i)
  }
  return hash >>> 0
}

const CART_FIXTURE = [
  {
    productId: "tri-002",
    slug: "openwater-flex-3-2",
    name: "Openwater Flex 3/2 Wetsuit",
    nameFr: "Combinaison Openwater Flex 3/2",
    price: 389.9,
    priceFr: 359.9,
    image: "/images/products/wetsuit.png",
    quantity: 1,
    selectedVariant: "M",
    selectedColor: "Noir",
  },
]

test.describe("ADH — modes de demo", () => {
  test("visite normale : aucune panne, aucun mode film", async ({ page }) => {
    // Table rase explicite. Le drapeau de panne est collant en sessionStorage,
    // par conception : c'est ce qui lui permet de survivre a la navigation
    // pendant un tournage. Un test qui affirme "le site est sain" ne doit donc
    // pas dependre de ce qu'une autre execution a laisse derriere elle.
    await page.addInitScript(() => {
      try {
        sessionStorage.clear()
      } catch {
        /* stockage indisponible : rien a nettoyer */
      }
    })

    await page.goto("/products/summit-grip-pro")
    await expect(page.locator("[data-error]")).toHaveCount(0)

    const state = await page.evaluate(() => {
      const w = window as typeof window & {
        __korvus?: { enableProofCapture?: boolean }
      }
      return {
        film: sessionStorage.getItem("adh_film"),
        bug: sessionStorage.getItem("adh_bug"),
        proof: w.__korvus?.enableProofCapture ?? false,
      }
    })
    expect(state).toEqual({ film: null, bug: null, proof: false })
  })

  test("?bug=pointure : le message ne sort que sur la pointure piegee", async ({
    page,
  }) => {
    await page.goto("/products/summit-grip-pro?bug=pointure")

    // Au chargement, la premiere pointure est pre-selectionnee : rien ne doit
    // s'afficher tant que le visiteur n'a pas clique. C'est ce clic qui est le
    // geste causal filme.
    await expect(page.locator("p.size-error")).toHaveCount(0)

    await page.getByRole("button", { name: "42", exact: true }).click()
    const message = page.locator("p.size-error")
    await expect(message).toHaveText("Cette pointure n'est plus disponible")
    // Les selecteurs que le collecteur d'erreurs UX reconnait.
    await expect(message).toHaveAttribute("role", "alert")
    await expect(message).toHaveAttribute("data-error", "")

    await page.getByRole("button", { name: "43", exact: true }).click()
    await expect(page.locator("p.size-error")).toHaveCount(0)
  })

  test("?bug=pointure : un autre modele n'est pas affecte", async ({ page }) => {
    await page.goto("/products/sky-race-light?bug=pointure")
    await page.getByRole("button", { name: "42", exact: true }).click()
    await expect(page.locator("p.size-error")).toHaveCount(0)
  })

  test("le panier affiche la vraie photo de chaque produit", async ({ page }) => {
    await page.addInitScript((cart) => {
      localStorage.setItem("adh_cart", JSON.stringify(cart))
      localStorage.setItem("adh_cookie_consent", "accepted")
    }, CART_FIXTURE)

    await page.goto("/cart")

    // Une vignette par ligne, servie par l'optimiseur Next depuis l'image du
    // produit (et pas un placeholder). naturalWidth > 0 prouve que le fichier
    // a vraiment ete charge : un src casse rendrait 0.
    const thumb = page.locator("a[href^='/products/'] img").first()
    await expect(thumb).toBeVisible()
    await expect(thumb).toHaveAttribute("src", /wetsuit\.png/)
    expect(await thumb.evaluate((n: HTMLImageElement) => n.naturalWidth)).toBeGreaterThan(0)
  })

  test("?bug=promo : le code promo renvoie 500 et le message s'affiche", async ({
    page,
  }) => {
    await page.addInitScript((cart) => {
      localStorage.setItem("adh_cart", JSON.stringify(cart))
      localStorage.setItem("adh_cookie_consent", "accepted")
    }, CART_FIXTURE)

    await page.goto("/cart?bug=promo")
    await page.fill("#promo-code", "UTMB25")

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/panier/code-promo")),
      page.locator("#promo-form button[type=submit]").click(),
    ])
    expect(response.status()).toBe(500)

    const message = page.locator("p.promo-error")
    await expect(message).toHaveText("Le code promo n'a pas pu être appliqué")
    await expect(message).toHaveAttribute("role", "alert")

    // Le champ se vide : c'est LA friction du scenario de demo (il faut retaper
    // le code a chaque essai, d'ou l'acharnement sur le bouton). Le dashboard de
    // demo decrit ce champ penible cote platform ; si ce vidage disparait, la
    // demo raconte quelque chose que le site ne fait plus.
    await expect(page.locator("#promo-code")).toHaveValue("")
  })

  test("?bug=promo : deux essais de suite laissent le message d'erreur et un champ vide", async ({
    page,
  }) => {
    await page.addInitScript((cart) => {
      localStorage.setItem("adh_cart", JSON.stringify(cart))
      localStorage.setItem("adh_cookie_consent", "accepted")
    }, CART_FIXTURE)

    await page.goto("/cart?bug=promo")

    // Deux passages complets saisie -> clic -> 500, comme un visiteur qui
    // s'acharne. Le second doit se comporter exactement comme le premier (pas
    // d'etat "pending" colle, pas de message qui disparait).
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.fill("#promo-code", "UTMB25")
      const [response] = await Promise.all([
        page.waitForResponse((r) => r.url().includes("/api/panier/code-promo")),
        page.locator("#promo-form button[type=submit]").click(),
      ])
      expect(response.status()).toBe(500)
      await expect(page.locator("p.promo-error")).toBeVisible()
      await expect(page.locator("#promo-code")).toHaveValue("")
    }

    // Aucune remise n'a ete appliquee : le total reste le sous-total du panier.
    await expect(page.locator("p.promo-feedback.text-green-700")).toHaveCount(0)
  })

  test("sans panne : la saisie du code promo est conservee apres un echec", async ({
    page,
  }) => {
    await page.addInitScript((cart) => {
      localStorage.setItem("adh_cart", JSON.stringify(cart))
      localStorage.setItem("adh_cookie_consent", "accepted")
    }, CART_FIXTURE)

    await page.goto("/cart")
    // Code inconnu -> 200 { applied: false } : un refus normal, hors panne. Le
    // site doit alors se comporter correctement et GARDER la saisie -- le
    // vidage est une friction reservee au scenario de demo.
    await page.fill("#promo-code", "CODEBIDON")

    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/panier/code-promo")),
      page.locator("#promo-form button[type=submit]").click(),
    ])

    await expect(page.locator("p.promo-error")).toBeVisible()
    await expect(page.locator("#promo-code")).toHaveValue("CODEBIDON")
  })

  test("sans panne : le meme code promo s'applique et remise le panier", async ({
    page,
  }) => {
    await page.addInitScript((cart) => {
      localStorage.setItem("adh_cart", JSON.stringify(cart))
      localStorage.setItem("adh_cookie_consent", "accepted")
    }, CART_FIXTURE)

    await page.goto("/cart")
    await page.fill("#promo-code", "UTMB25")

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/panier/code-promo")),
      page.locator("#promo-form button[type=submit]").click(),
    ])
    expect(response.status()).toBe(200)

    await expect(page.locator("p.promo-error")).toHaveCount(0)
    await expect(page.locator("p.promo-feedback")).toBeVisible()
    // 359,90 - 25 % = 269,925, arrondi a 269,92 par toFixed. Au-dessus du
    // seuil de port offert (50), donc pas de frais a ajouter.
    await expect(page.locator(".cart-total")).toHaveText("269,92 €")
  })

  test("la remise du panier survit au passage au checkout", async ({ page }) => {
    await page.addInitScript((cart) => {
      localStorage.setItem("adh_cart", JSON.stringify(cart))
      localStorage.setItem("adh_cookie_consent", "accepted")
    }, CART_FIXTURE)

    await page.goto("/cart")
    await page.fill("#promo-code", "UTMB25")
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/panier/code-promo")),
      page.locator("#promo-form button[type=submit]").click(),
    ])
    await expect(page.locator(".cart-total")).toHaveText("269,92 €")

    // Sans persistance, le checkout recalculait sur le prix plein : le visiteur
    // voyait 269,92 EUR au panier puis 359,90 EUR a l'ecran suivant.
    // Emprunte le vrai parcours visiteur : le clic attend la navigation du
    // routeur et ne court pas contre son refresh tardif apres la promo.
    await page.getByRole("link", { name: "Passer commande" }).click()
    await expect(page).toHaveURL(/\/checkout$/)
    await expect(page.getByText("-89,97 €")).toBeVisible()
    await expect(page.getByText("269,92 €").first()).toBeVisible()
  })

  test("?bug=paiement : l'autorisation renvoie 500 et la commande n'est pas creee", async ({
    page,
  }) => {
    await page.addInitScript((cart) => {
      localStorage.setItem("adh_cart", JSON.stringify(cart))
      localStorage.setItem("adh_cookie_consent", "accepted")
    }, CART_FIXTURE)

    await page.goto("/checkout?bug=paiement")
    for (const [field, value] of [
      ["#firstName", "Camille"],
      ["#lastName", "Roux"],
      ["#email", "camille.roux@example.test"],
      ["#address", "12 rue des Coureurs"],
      ["#city", "Chamonix"],
      ["#postalCode", "74400"],
      ["#country", "France"],
      ["#cardNumber", "4242 4242 4242 4242"],
      ["#expiryDate", "12/29"],
      ["#cvv", "123"],
    ]) {
      await page.fill(field, value)
    }

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/paiement")),
      page.locator("form button[type=submit]").click(),
    ])
    expect(response.status()).toBe(500)

    const message = page.locator("p.checkout-error")
    await expect(message).toHaveText("Le paiement a été refusé, merci de réessayer")
    // Le visiteur reste sur le checkout : aucune commande n'a ete creee.
    expect(new URL(page.url()).pathname).toBe("/checkout")
  })

  test("?film=1 : session dediee, pre-echantillonnee, et collante entre pages", async ({
    page,
  }) => {
    // Le chunk de preuve est servi par le domaine de prod : on le neutralise
    // pour que le test ne depende pas du reseau.
    await page.route("https://demo.korvus.fr/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "",
      })
    })

    await page.goto("/?film=1")
    const first = await page.evaluate(() => ({
      sid: sessionStorage.getItem("korvus_sid"),
      createdAt: sessionStorage.getItem("korvus_sid_created_at"),
    }))

    expect(first.sid).toMatch(UUID_V4)
    expect(first.sid).not.toBe(PINNED_SID)
    expect(first.createdAt).toBeTruthy()
    expect(Number.isNaN(Date.parse(first.createdAt!))).toBe(false)
    // Le tirage doit tomber dans les 25 % filmes : djb2(sid) < 2^30.
    expect(djb2(first.sid!)).toBeLessThan(1_073_741_824)

    // Le mode colle sans reporter le parametre, pour que la page precedente
    // entre dans le film.
    await gotoAfterDevReload(page, "/cart")
    const second = await page.evaluate(() => {
      const w = window as typeof window & {
        __korvus?: { enableProofCapture?: boolean; proofPolicyId?: string }
      }
      return {
        sid: sessionStorage.getItem("korvus_sid"),
        enabled: w.__korvus?.enableProofCapture ?? false,
        policyId: w.__korvus?.proofPolicyId,
      }
    })
    expect(second.sid).toBe(first.sid)
    expect(second.enabled).toBe(true)
    // Sans politique, la capture part en repli strict : tout est masque, y
    // compris le message d'erreur que la preuve doit montrer.
    expect(second.policyId).toBe("f2c220321a992bef70b65931")
  })

  test("?film=new force une session neuve", async ({ page }) => {
    await page.route("https://demo.korvus.fr/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" })
    })

    await page.goto("/?film=1")
    const first = await page.evaluate(() => sessionStorage.getItem("korvus_sid"))
    await gotoAfterDevReload(page, "/?film=new")
    const second = await page.evaluate(() => sessionStorage.getItem("korvus_sid"))

    expect(second).toMatch(UUID_V4)
    expect(second).not.toBe(first)
    expect(djb2(second!)).toBeLessThan(1_073_741_824)
  })

  test("?bug=off remet le site en etat sain sans changer d'onglet", async ({
    page,
  }) => {
    await page.goto("/products/summit-grip-pro?bug=pointure")
    await page.getByRole("button", { name: "42", exact: true }).click()
    await expect(page.locator("p.size-error")).toBeVisible()

    await page.goto("/products/summit-grip-pro?bug=off")
    await page.getByRole("button", { name: "42", exact: true }).click()
    await expect(page.locator("p.size-error")).toHaveCount(0)
    expect(
      await page.evaluate(() => sessionStorage.getItem("adh_bug")),
    ).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Politique de masquage : chaque selecteur revele doit exister dans le DOM
//
// C'est le mode de panne le plus couteux de la preuve video, et le plus
// silencieux : une politique dont les selecteurs ne matchent rien produit une
// video valide, encodee, `ready` -- et entierement masquee. Rien ne le signale,
// ni un statut, ni un test, ni un log. On s'en apercoit devant le prospect.
//
// Le cas s'est produit : la politique visait `/produit/*` et `.stock-msg` alors
// que le site sert `/products/<slug>` et n'a jamais eu cette classe.
// ---------------------------------------------------------------------------

import fs from "node:fs"
import path from "node:path"

interface PolicyRule {
  path?: string
  page_type?: string
  reveal?: string[] | "*"
}

// La SOURCE versionnee de la politique, pas un artefact copie.
//
// Ce test lisait `apps/athletedatahub/public/proof-policy/<id>.js`, une copie
// deposee a la main dans ce depot. Elle a disparu avec le basculement du site
// vers le CDN (31/07) -- et c'est tant mieux : une copie que personne ne
// resynchronise finit par decrire une politique qui n'est plus appliquee, donc
// par valider des selecteurs qui ne revelent plus rien.
//
// On lit desormais le JSON de `platform`, qui est ce que le workflow
// proof-policies.yml publie sur le CDN. Le chemin explicite rend le test
// portable dans un worktree ; le checkout voisin reste le fallback CI/local.
const PLATFORM_ROOT = process.env.KORVUS_PLATFORM_ROOT
  ? path.resolve(process.env.KORVUS_PLATFORM_ROOT)
  : path.resolve(__dirname, "..", "..", "..", "platform")
const POLICY_FILE = path.join(
  PLATFORM_ROOT,
  "config",
  "proof-policies",
  "demo-korvus-fr.json",
)

/** Selecteurs qui n'apparaissent qu'apres une erreur ou une action : hors gate. */
const CONDITIONAL = new Set([".promo-feedback", ".checkout-error", ".field-error"])

/** Une page representative par portee de regle, et ce qu'il faut y faire. */
const SCOPE_PAGES: Record<string, { url: string; prepare?: string }> = {
  plp: { url: "/catalog/trail" },
  "/products/*": { url: "/products/summit-grip-pro?bug=pointure", prepare: "size42" },
  cart: { url: "/cart" },
  checkout: { url: "/checkout" },
}

// Le JSON source se lit tel quel : c'est le build (scripts/build-proof-policies.js)
// qui l'enveloppe dans `window.__korvusProofPolicy=...;` pour le CDN. On retire
// quand meme l'enveloppe si elle est presente, pour qu'un pointage accidentel
// vers l'artefact publie ne fasse pas echouer le parse de facon obscure.
const POLICY = JSON.parse(
  fs
    .readFileSync(POLICY_FILE, "utf8")
    .replace(/^window\.__korvusProofPolicy=/, "")
    .replace(/;\s*$/, ""),
) as { rules: PolicyRule[] }

test.describe("ADH — politique de masquage", () => {
  // Un test par portee, et non une boucle de navigations sur la meme page :
  // chaque cas part d'un onglet neuf, ce qui elimine tout enchainement de
  // `goto` susceptible de s'interrompre l'un l'autre.
  for (const rule of POLICY.rules) {
    const scope = rule.path ?? rule.page_type
    const target = scope ? SCOPE_PAGES[scope] : undefined
    if (!target || rule.reveal === undefined || rule.reveal === "*") continue
    const selectors = rule.reveal.filter((s) => !CONDITIONAL.has(s))
    if (selectors.length === 0) continue

    test(`${scope} : aucun selecteur revele n'est mort`, async ({ page }) => {
      await page.addInitScript((cart) => {
        localStorage.setItem("adh_cookie_consent", "accepted")
        localStorage.setItem("adh_cart", JSON.stringify(cart))
      }, CART_FIXTURE)

      await page.goto(target.url)
      await page.waitForLoadState("load")
      if (target.prepare === "size42") {
        await page.getByRole("button", { name: "42", exact: true }).click()
      }

      const dead: string[] = []
      for (const selector of selectors) {
        // Attendre plutot que compter tout de suite : le panier et le
        // recapitulatif se peuplent depuis localStorage APRES le montage, et
        // webkit y met plus de temps que chromium. Un comptage immediat
        // declarerait morts des selecteurs parfaitement vivants.
        await page
          .locator(selector)
          .first()
          .waitFor({ state: "attached", timeout: 8_000 })
          .catch(() => dead.push(selector))
      }

      expect(
        dead,
        `selecteurs reveles sans cible sur ${target.url} : la video serait masquee a cet endroit`,
      ).toEqual([])
    })
  }
})
