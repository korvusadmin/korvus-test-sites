import { test, expect } from "@playwright/test"
import { IngestInterceptor } from "../helpers/ingest-interceptor"
import { injectSnippet } from "../helpers/inject-snippet"

// Fixtures C0b/R2 — enrichissement de la capture de frustration, signaux qui
// n'existent QUE en vrai navigateur (getComputedStyle / getBoundingClientRect /
// focus-blur), differees de R1 car non testables en jsdom :
//   - C0b.1 cursor:pointer au clic  -> distingue une vraie fausse-affordance
//     d'un misclic sur du vide (cursor_pointer sur frustration_detected).
//   - C0b.2 taille de la cible      -> bucket tiny/small/adequate (cibles
//     tactiles trop petites), jamais de px brut.
//   - C0b.3 friction de formulaire  -> field_friction (counts par champ,
//     selector_hash seul, aucune PII), emis eager au blur.
//
// Tournent sur doomcheck (matrice Chromium/WebKit/Firefox/mobile). Les elements
// de fixture sont injectes dynamiquement : les collecteurs frustration /
// field_friction ecoutent en delegation sur document, donc ils captent les
// noeuds ajoutes apres le boot (contrairement a add_to_cart qui lit le DOM une
// fois a l'init). L'horloge Playwright avance virtuellement jusqu'a la fin de
// la fenetre dead_click (1200ms) : le vrai timer du bundle tire sans imposer
// cette attente sur chaque moteur de la matrice CI.
//
// Clics DISPATCHES programmatiquement (MouseEvent bubblant via page.evaluate),
// PAS page.click : le snippet ecoute en delegation capture-phase sur document,
// donc un event synthetique exerce exactement le meme code. page.click exige
// l'actionnabilite (visibilite/scroll/pas d'overlay) et echoue sur mobile
// (Pixel 7) quand l'element injecte est hors-fold ou couvert — et la cible
// "trop petite" (18px) est par nature sous le seuil tactile. Pattern documente
// dans .claude/rules/tests-snippet.md (custom elements / delegated click).

const BOOT_MS = 600
const DEAD_CLICK_WINDOW_MS = 1_200

test.describe("C0b.1/.2 — cursor:pointer + bucket de taille au clic", () => {
  test("fausse affordance (div cursor:pointer inerte) -> cursor_pointer:true, taille adequate, dom_responded:false", async ({
    page,
  }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")
    await page.goto("/")
    await page.waitForTimeout(BOOT_MS)
    await page.clock.install()

    // Div qui A L'AIR cliquable (cursor:pointer) mais NE FAIT RIEN (aucun
    // handler, aucune mutation). Taille >= 44px -> bucket adequate.
    await page.evaluate(() => {
      const d = document.createElement("div")
      d.id = "kv-fake-affordance"
      d.style.cssText =
        "cursor:pointer;width:240px;height:60px;background:#eee"
      d.textContent = "Looks clickable"
      document.body.appendChild(d)
      d.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    await page.clock.fastForward(DEAD_CLICK_WINDOW_MS)
    await interceptor.triggerFlush()

    const events = interceptor.getEvents("frustration_detected")
    const dead = events.find((e) => e.payload.type === "dead_click")
    expect(dead, "un dead_click doit etre emis sur la fausse affordance").toBeTruthy()
    expect(dead!.payload.cursor_pointer).toBe(true)
    expect(dead!.payload.target_size_bucket).toBe("adequate")
    expect(dead!.payload.dom_responded).toBe(false)
    expect(dead!.payload.window_ms).toBe(DEAD_CLICK_WINDOW_MS)
    // CNIL : pas de px brut, pas de coordonnees.
    expect(dead!.payload).not.toHaveProperty("width")
    expect(dead!.payload).not.toHaveProperty("client_x")
  })

  test("cible tactile trop petite (<24px) -> target_size_bucket:tiny", async ({
    page,
  }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")
    await page.goto("/")
    await page.waitForTimeout(BOOT_MS)
    await page.clock.install()

    await page.evaluate(() => {
      const b = document.createElement("button")
      b.id = "kv-tiny"
      b.style.cssText = "cursor:pointer;width:18px;height:18px;padding:0;border:0"
      b.textContent = "x"
      document.body.appendChild(b)
      b.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    await page.clock.fastForward(DEAD_CLICK_WINDOW_MS)
    await interceptor.triggerFlush()

    const dead = interceptor
      .getEvents("frustration_detected")
      .find((e) => e.payload.type === "dead_click")
    expect(dead, "un dead_click doit etre emis sur la petite cible").toBeTruthy()
    expect(dead!.payload.target_size_bucket).toBe("tiny")
    expect(dead!.payload.cursor_pointer).toBe(true)
    expect(dead!.payload.window_ms).toBe(DEAD_CLICK_WINDOW_MS)
  })
})

test.describe("C0b.3 — field_friction (friction de formulaire par champ)", () => {
  test("champ revisite + recorrige -> field_friction avec counts, selector_hash seul (pas de selector_path)", async ({
    page,
  }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")
    await page.goto("/")
    await page.waitForTimeout(BOOT_MS)

    await page.evaluate(() => {
      const form = document.createElement("form")
      form.setAttribute("onsubmit", "return false")
      const input = document.createElement("input")
      input.id = "kv-field"
      input.type = "text"
      form.appendChild(input)
      document.body.appendChild(form)
    })

    // Struggle realiste : editer (change avant blur) -> quitter -> revenir ->
    // editer -> quitter. Le change natif fire avant le blur, donc au 2e blur les
    // compteurs sont complets et l'emission eager tire. focus/change/blur
    // programmatiques (les listeners delegues focusin/focusout/change captent
    // les events synthetiques) -> robuste mobile, pas d'actionnabilite requise.
    const editAndLeave = async () => {
      await page.evaluate(() => {
        const f = document.getElementById("kv-field") as HTMLInputElement
        f.focus()
        f.dispatchEvent(new Event("change", { bubbles: true }))
        f.blur()
      })
      await page.waitForTimeout(50)
    }
    await editAndLeave() // focus #1 + change #1 + blur #1
    await editAndLeave() // focus #2 (revisite) + change #2 + blur #2 -> emit

    await interceptor.triggerFlush()

    const ff = interceptor.getEvents("field_friction")
    expect(ff.length, "un field_friction doit etre emis").toBeGreaterThanOrEqual(1)
    const p = ff[0].payload
    expect(p.revisit_count).toBeGreaterThanOrEqual(1)
    expect(p.change_count).toBeGreaterThanOrEqual(2)
    expect(p.focus_count).toBeGreaterThanOrEqual(2)
    expect(typeof p.selector_hash).toBe("string")
    // CNIL : selector_hash SEUL, jamais selector_path ni contenu/valeur.
    expect(p.selector_path).toBeUndefined()
    expect(p).not.toHaveProperty("value")
    expect(p).not.toHaveProperty("name")
  })

  test("champ normal (1 focus, 1 blur, 0 revisite) -> aucun field_friction", async ({
    page,
  }) => {
    const interceptor = new IngestInterceptor(page)
    await interceptor.attach()
    await injectSnippet(page, "doomcheck")
    await page.goto("/")
    await page.waitForTimeout(BOOT_MS)

    await page.evaluate(() => {
      const input = document.createElement("input")
      input.id = "kv-normal-field"
      input.type = "text"
      document.body.appendChild(input)
      input.focus()
      input.blur()
    })
    await page.waitForTimeout(50)
    await interceptor.triggerFlush()

    expect(interceptor.getEvents("field_friction").length).toBe(0)
  })
})
