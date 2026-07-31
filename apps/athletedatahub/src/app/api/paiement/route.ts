import { NextResponse } from "next/server";

/**
 * Autorisation de paiement simulee.
 *
 * Sert la panne de demo `paiement` : sur un panier a fort montant, la demande
 * d'autorisation revient en 500 alors que la carte saisie est valide. Le site
 * accuse alors la carte du visiteur, ce qui est exactement l'histoire qu'on
 * veut montrer -- le coupable est un 500 maison.
 *
 * DEUX CONTRAINTES MOTEUR PORTEES PAR CE FICHIER
 *
 * 1. Le nom du chemin. Tout endpoint contenant un token de tracking (`/track`,
 *    `/collect`, `/hit`, `/metrics`...) bascule en famille `analytics_marketing`
 *    cote Korvus -- la seule famille marquee "bruit" -- et le dossier
 *    disparait du dashboard. `/api/paiement` est neutre, et court : le titre
 *    rendu ("Le paiement echoue cote serveur sur ... (500)") dispose d'environ
 *    30 caracteres de budget pour le chemin avant troncature.
 *
 * 2. La latence. Au-dela de 10 s, le collecteur classe la requete en `timeout`
 *    et non en `http_5xx`, et le titre devient "met trop de temps a repondre".
 *    700 ms est credible pour une autorisation, et loin du seuil.
 *
 * Le drapeau de panne voyage dans le CORPS, jamais dans l'URL : la signature
 * d'une erreur reseau est `host | chemin | code`, et un chemin pollue par un
 * parametre de demo se retrouverait affiche dans le titre du dossier.
 */
const AUTHORIZATION_LATENCY_MS = 700;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  await new Promise((resolve) => setTimeout(resolve, AUTHORIZATION_LATENCY_MS));

  if (body?.bug === "paiement") {
    return NextResponse.json(
      { error: "authorization_declined_upstream" },
      { status: 500 }
    );
  }

  return NextResponse.json({ approved: true }, { status: 200 });
}
