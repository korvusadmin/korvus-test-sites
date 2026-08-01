"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { t } from "@/lib/i18n";
import { useLocale } from "@/context/LocaleContext";
import { useDemoBug } from "@/context/DemoBugContext";
import { writeAppliedPromo } from "@/lib/cart-totals";

type PromoState = "idle" | "pending" | "applied" | "invalid" | "error";

// Une requete qui ne repond jamais laisse le bouton en "Application..." jusqu'a
// l'expiration TCP, soit environ deux minutes. Pendant un tournage, ca gache la
// prise ET consomme un slot de quota de preuve.
const PROMO_TIMEOUT_MS = 8_000;

interface PromoCodeFormProps {
  /** Remonte le taux de remise applique (0 = aucune remise). */
  onApplied: (rate: number) => void;
}

export function PromoCodeForm({ onApplied }: PromoCodeFormProps) {
  const { locale } = useLocale();
  const bug = useDemoBug();
  const [code, setCode] = useState("");
  const [state, setState] = useState<PromoState>("idle");

  /** Remonte la remise au panier ET la persiste, pour qu'elle survive au checkout. */
  function applyRate(rate: number, appliedCode?: string) {
    writeAppliedPromo(rate > 0 && appliedCode ? { code: appliedCode, rate } : null);
    onApplied(rate);
  }

  /**
   * Echec d'application : on repasse en "error" et, SOUS LA PANNE `promo`
   * UNIQUEMENT, on vide le champ.
   *
   * Ce n'est pas une coquetterie : c'est la friction qui transforme un refus en
   * acharnement. Le visiteur doit retaper "UTMB25" en entier a chaque essai, et
   * c'est ce qui produit la mediane de 4 clics sur "Appliquer" que la Sentinelle
   * Ergonomie affiche (dossiers `ergo_field_friction_promo_field_cleared` et
   * `ergo_rage_click_promo_apply_rejected` de lib/demo/fixtures/ergonomie.ts
   * cote platform). Sans ce vidage, le dashboard de demo decrit un champ penible
   * que le site ne montre pas -- l'incoherence se verrait a l'ecran pendant la
   * demo.
   *
   * Hors panne, le comportement nominal du faux site ne bouge pas : la saisie
   * est conservee, comme sur n'importe quel site correct.
   */
  function failApply() {
    setState("error");
    applyRate(0);
    if (bug === "promo") setCode("");
  }

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    setState("pending");
    try {
      const res = await fetch("/api/panier/code-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, bug }),
        signal: AbortSignal.timeout(PROMO_TIMEOUT_MS),
      });
      if (!res.ok) {
        failApply();
        return;
      }
      const data = (await res.json()) as { applied?: boolean; rate?: number };
      if (data.applied === true) {
        setState("applied");
        applyRate(data.rate ?? 0, code.trim().toUpperCase());
      } else {
        setState("invalid");
        applyRate(0);
      }
    } catch {
      // Deliberement PAS failApply() : un timeout reseau n'est pas la friction
      // de demo. On signale l'echec sans vider le champ -- le visiteur n'a pas
      // a retaper son code parce que le reseau a lache.
      setState("error");
      applyRate(0);
    }
  }

  return (
    <div className="border-t border-gray-100 pt-3 space-y-2">
      <p className="promo-campaign text-xs font-medium text-blue-700">
        {t("promoCampaign", locale)}
      </p>

      <form id="promo-form" onSubmit={handleApply} className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <Input
            id="promo-code"
            name="promo-code"
            label={t("promoCode", locale)}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="UTMB25"
            autoComplete="off"
          />
        </div>
        <Button
          type="submit"
          variant="outline"
          className="cta-label"
          disabled={state === "pending"}
          data-korvus-label={t("promoApply", locale)}
        >
          {state === "pending" ? t("promoApplying", locale) : t("promoApply", locale)}
        </Button>
      </form>

      {/*
        Le retour positif est un <p> NU : surtout pas role="status" avec
        aria-live="polite", qui est un selecteur d'erreur UX cote Korvus -- on
        emettrait une fausse erreur a chaque code valide. Et `promo-feedback`
        ne contient ni "error" ni "invalid", donc aucun filet large ne l'attrape.
      */}
      {state === "applied" && (
        <p className="promo-feedback text-sm text-green-700">
          {t("promoApplied", locale)}
        </p>
      )}

      {(state === "invalid" || state === "error") && (
        <p
          className="promo-feedback promo-error text-sm text-red-600"
          role="alert"
          data-error=""
        >
          {state === "error" ? t("promoFailed", locale) : t("promoInvalid", locale)}
        </p>
      )}
    </div>
  );
}
