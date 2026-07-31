import { NextResponse } from "next/server";

/**
 * Application d'un code promotionnel.
 *
 * Sert la panne de demo `promo` : la campagne "-25 % avant l'UTMB" est en
 * ligne, le media tourne, et l'application du code renvoie 500. Le marchand
 * paie deux fois -- le trafic et la remise consentie -- sans rien encaisser.
 *
 * POURQUOI LE PANIER ET PAS LE CHECKOUT
 * Le `page_type` de la page qui porte l'appel decide de la famille du dossier :
 * depuis `/cart` la famille est `cart`, dont le sujet affiche est "Le panier"
 * (9 caracteres). Depuis le checkout ce serait "Le tunnel de commande" (21),
 * le budget de chemin tomberait a 20 et le titre se tronquerait en
 * "/api/panier..." -- le mot "code-promo", tout l'interet de la ligne,
 * disparaitrait. Les deux familles sont critiques, on ne perd rien d'autre.
 *
 * Voir aussi les contraintes de nommage et de latence documentees dans
 * ../../paiement/route.ts : elles s'appliquent a l'identique ici.
 */
const VALID_CODE = "UTMB25";
const DISCOUNT_RATE = 0.25;
const LOOKUP_LATENCY_MS = 650;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  await new Promise((resolve) => setTimeout(resolve, LOOKUP_LATENCY_MS));

  // La campagne est valide : c'est le service qui tombe. Cette nuance est tout
  // le scenario -- un code expire ne serait qu'une erreur de saisie.
  if (body?.bug === "promo") {
    return NextResponse.json(
      { error: "promotion_service_unavailable" },
      { status: 500 }
    );
  }

  const code = String(body?.code ?? "").trim().toUpperCase();
  if (code !== VALID_CODE) {
    return NextResponse.json({ applied: false }, { status: 200 });
  }

  return NextResponse.json(
    { applied: true, rate: DISCOUNT_RATE },
    { status: 200 }
  );
}
