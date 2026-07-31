/**
 * Registre des pannes jouables du site de demo (demo.korvus.fr).
 *
 * Ces pannes servent a produire des preuves video commerciales : un visiteur
 * bute sur une erreur, on filme sa reaction, et le dossier correspondant
 * s'affiche dans la Sentinelle Erreurs.
 *
 * OPT-IN PAR URL, JAMAIS ACTIF PAR DEFAUT. Les E2E (athletedatahub.spec.ts)
 * ne posent aucun de ces parametres, donc ils voient toujours le site sain.
 * Un bug actif par defaut casserait au minimum le happy path chaine, le
 * quick-add hors PDP et la vitrine bilingue -- en chromium ET en webkit.
 *
 * Le drapeau vit en sessionStorage (pas localStorage) : un nouvel onglet est
 * une session propre, ce qui est exactement la granularite d'un tournage.
 */
export const DEMO_BUGS = ["paiement", "promo", "pointure"] as const;

export type DemoBug = (typeof DEMO_BUGS)[number];

const STORAGE_KEY = "adh_bug";

function isDemoBug(value: string): value is DemoBug {
  return (DEMO_BUGS as readonly string[]).includes(value);
}

/**
 * Lit l'URL courante, met a jour la session, retourne la panne active.
 *
 * `?bug=off` remet le site en etat sain sans fermer l'onglet -- utile entre
 * deux prises pour filmer le parcours temoin.
 */
export function resolveDemoBug(): DemoBug | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = new URLSearchParams(window.location.search).get("bug");
    if (raw === "off") {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (raw !== null && isDemoBug(raw)) {
      window.sessionStorage.setItem(STORAGE_KEY, raw);
      return raw;
    }
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    return stored !== null && isDemoBug(stored) ? stored : null;
  } catch {
    // sessionStorage indisponible (navigation privee stricte, iframe cloisonnee)
    return null;
  }
}
