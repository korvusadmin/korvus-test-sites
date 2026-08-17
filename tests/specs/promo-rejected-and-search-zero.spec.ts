import { test, expect, type Page } from "@playwright/test"
import { IngestInterceptor } from "../helpers/ingest-interceptor"
import { injectSnippet, getSiteConfig } from "../helpers/inject-snippet"

// Vague 2 — Worker B4.4 — promo rejected.
//
// promo_code_rejected : le visiteur tape un code promo que le serveur rejette
// → fuite « promo cassé » qui démontre la perte de confiance à l'étape
// paiement (mauvaise config marketing OU code expiré).
//
// Le second volet de ce fichier couvrait search_performed avec
// has_zero_results. Le collector a été retiré le 2026-08-17 (ENG-62) : mesuré
// sur 14 jours de production, has_zero_results n'était vrai 0 fois sur 24 446
// événements, et aucune alerte search_no_results n'avait jamais été émise.
// La Sentinelle V2 « Recherche interne » est enterrée avec lui.

const doomcheck = getSiteConfig("doomcheck")

async function simulateAxeptio(page: Page, granted: boolean): Promise<void> {
  await page.addInitScript((consent: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    w._axcb = []
    w.axeptio_settings = { cookies: { google_analytics: consent } }
  }, granted)
}

// ---------------------------------------------------------------------------
// promo_attempted — site custom, decision serveur
// ---------------------------------------------------------------------------

test.describe("Worker B4.4 — promo_attempted custom", () => {
  test("submit code promo invalide + message DOM → tentative brute avec signal de rejet", async ({
    page,
  }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, doomcheck)

    await page.goto("/sim/checkout")
    await page.waitForTimeout(800)

    // Construit un formulaire avec un input nommé `promo` (le snippet
    // détecte `name=promo|coupon|discount|...`). On le submit puis on
    // injecte le message d'erreur DOM dans la fenêtre 2s du collector.
    await page.evaluate(() => {
      const root = document.querySelector("#sim-root") as HTMLElement
      const form = document.createElement("form")
      form.id = "promo-form"
      form.onsubmit = (e) => e.preventDefault()
      const input = document.createElement("input")
      input.type = "text"
      input.name = "promo"
      input.id = "promo-input"
      input.value = "EXPIRED2024"
      form.appendChild(input)
      const btn = document.createElement("button")
      btn.type = "submit"
      btn.id = "promo-submit"
      btn.textContent = "Apply"
      form.appendChild(btn)
      root.appendChild(form)
    })

    await page.click("#promo-submit")
    await page.waitForTimeout(150)

    // Message DOM "promo invalide" — keyword multilingue normalisé par
    // PROMO_REJECTION_KEYWORDS (cf. lib/patterns/promo-rejection.ts).
    await page.evaluate(() => {
      const input = document.getElementById("promo-input") as HTMLInputElement
      input.classList.add("error", "is-invalid")
      const errorMsg = document.createElement("div")
      errorMsg.className = "error-text promo-error"
      errorMsg.textContent = "Code promo invalide ou expiré"
      input.parentElement?.appendChild(errorMsg)
    })

    // Sur un site custom, le snippet attend 1500 ms puis emet les signaux
    // bruts ; le serveur decide ensuite accepte/rejete.
    await page.waitForTimeout(1600)
    await interceptor.triggerFlush()

    const events = interceptor.getEvents("promo_attempted")
    expect(
      events.length,
      "promo_attempted devrait être émis sur un site custom",
    ).toBeGreaterThan(0)
    expect(events[0].payload.promo_code).toBe("EXPIRED2024")
    expect(events[0].payload.source).toBe("custom_generic")
    expect(events[0].payload.reject_signal).toBe(true)
    const rejectionText = String(events[0].payload.reject_text || "")
    expect(rejectionText.length).toBeGreaterThan(0)
    expect(rejectionText.toLowerCase()).toMatch(/invalide|expir/)
    expect(interceptor.getEvents("promo_code_rejected")).toHaveLength(0)
  })
})

