"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { resolveDemoBug, type DemoBug } from "@/lib/demo-bugs";

/**
 * Diffuse la panne de demo active a tout l'arbre client.
 *
 * On lit window.location.search dans un effet et on se resynchronise sur
 * usePathname(), DELIBEREMENT au lieu de useSearchParams().
 *
 * useSearchParams() dans un composant client rendu par une route prerendue
 * (30 fiches produit + 6 categories ont un generateStaticParams) impose une
 * frontiere Suspense, sinon `next build` echoue. Et poser ce Suspense autour
 * d'un provider qui enveloppe children ferait basculer TOUT l'arbre cote
 * client : on perdrait le SSG de 36 pages pour lire un parametre d'URL.
 *
 * Effet de bord heureux : l'etat initial est null au serveur comme au premier
 * rendu client, donc zero divergence d'hydratation.
 */
const DemoBugContext = createContext<DemoBug | null>(null);

export function DemoBugProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [bug, setBug] = useState<DemoBug | null>(null);

  useEffect(() => {
    setBug(resolveDemoBug());
  }, [pathname]);

  // usePathname ne bouge pas quand seuls les parametres changent : un retour
  // arriere de /cart?bug=promo vers /cart laisserait la panne active. Aucune
  // navigation de l'app ne fait ca aujourd'hui, mais le navigateur, si.
  useEffect(() => {
    const onPopState = (): void => setBug(resolveDemoBug());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return (
    <DemoBugContext.Provider value={bug}>{children}</DemoBugContext.Provider>
  );
}

export function useDemoBug(): DemoBug | null {
  return useContext(DemoBugContext);
}

export function useHasBug(id: DemoBug): boolean {
  return useContext(DemoBugContext) === id;
}
