"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { t } from "@/lib/i18n";
import { useLocale } from "@/context/LocaleContext";
import { useDemoBug } from "@/context/DemoBugContext";

type PromoState = "idle" | "pending" | "applied" | "invalid" | "error";

interface PromoCodeFormProps {
  /** Remonte le taux de remise applique (0 = aucune remise). */
  onApplied: (rate: number) => void;
}

export function PromoCodeForm({ onApplied }: PromoCodeFormProps) {
  const { locale } = useLocale();
  const bug = useDemoBug();
  const [code, setCode] = useState("");
  const [state, setState] = useState<PromoState>("idle");

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    setState("pending");
    try {
      const res = await fetch("/api/panier/code-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, bug }),
      });
      if (!res.ok) {
        setState("error");
        onApplied(0);
        return;
      }
      const data = (await res.json()) as { applied?: boolean; rate?: number };
      if (data.applied === true) {
        setState("applied");
        onApplied(data.rate ?? 0);
      } else {
        setState("invalid");
        onApplied(0);
      }
    } catch {
      setState("error");
      onApplied(0);
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
