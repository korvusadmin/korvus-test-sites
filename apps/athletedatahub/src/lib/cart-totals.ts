import type { Locale } from "@/lib/i18n";
import type { CartItem } from "@/types";

/**
 * Regles de total du panier, partagees par le panier et le checkout.
 *
 * Elles vivaient en double, avec deja une divergence : le panier calculait les
 * frais de port apres remise, le checkout avant. Un site de demo qui s'affiche
 * a un prospect ne peut pas annoncer deux totaux differents pour le meme panier.
 */
export const FREE_SHIPPING_THRESHOLD = 50;

const PROMO_STORAGE_KEY = "adh_promo";

export interface AppliedPromo {
  readonly code: string;
  readonly rate: number;
}

/**
 * Somme les lignes DANS LA DEVISE AFFICHEE.
 *
 * Le total du CartContext somme `price`, c'est-a-dire le prix en dollars, alors
 * que chaque ligne est rendue en `priceFr` sur le site francais : le
 * recapitulatif annoncait plus que la somme visible a l'ecran.
 */
export function subtotalFor(items: readonly CartItem[], locale: Locale): number {
  return items.reduce(
    (sum, item) => sum + (locale === "fr" ? item.priceFr : item.price) * item.quantity,
    0
  );
}

export function shippingFeeFor(total: number, locale: Locale): number {
  if (total >= FREE_SHIPPING_THRESHOLD) return 0;
  return locale === "fr" ? 5.99 : 6.99;
}

export function formatAmount(amount: number, locale: Locale): string {
  // Virgule decimale en francais : un site FR qui affiche "569.90 €" se
  // remarque tout de suite en gros plan. On reste sur toFixed (deterministe,
  // pas d'Intl) et on substitue le separateur.
  return locale === "fr"
    ? `${amount.toFixed(2).replace(".", ",")} €`
    : `$${amount.toFixed(2)}`;
}

/**
 * La remise vit en sessionStorage, pas en state React : sans elle, un visiteur
 * qui applique un code au panier puis passe au checkout voit le prix plein
 * revenir. C'est le genre d'incoherence qu'un prospect releve a l'ecran.
 */
export function readAppliedPromo(): AppliedPromo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PROMO_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<AppliedPromo>;
    if (typeof parsed.rate !== "number" || !Number.isFinite(parsed.rate)) return null;
    if (parsed.rate <= 0 || parsed.rate >= 1) return null;
    return { code: String(parsed.code ?? ""), rate: parsed.rate };
  } catch {
    return null;
  }
}

export function writeAppliedPromo(promo: AppliedPromo | null): void {
  if (typeof window === "undefined") return;
  try {
    if (promo === null) {
      window.sessionStorage.removeItem(PROMO_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(PROMO_STORAGE_KEY, JSON.stringify(promo));
  } catch {
    // sessionStorage indisponible : la remise ne survit pas a la page, tant pis.
  }
}
