"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Cookie } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { pushDataLayer } from "@/lib/gtm";
import { useLocale } from "@/context/LocaleContext";

declare global {
  interface Window {
    __korvusCMP?: {
      accept: () => void;
      decline: () => void;
      getStatus: () => "accepted" | "declined" | null;
    };
  }
}

const CONSENT_KEY = "adh_cookie_consent";

type ConsentState = "accepted" | "declined" | null;

export function CookieBanner() {
  const [consent, setConsent] = useState<ConsentState | "loading">("loading");
  const { locale } = useLocale();
  const isFr = locale === "fr";

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONSENT_KEY) as ConsentState;
      setConsent(stored);
    } catch {
      setConsent(null);
    }
  }, []);

  const accept = useCallback(() => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    setConsent("accepted");
    pushDataLayer("cookie_consent", { consent_status: "accepted" });
  }, []);

  const decline = useCallback(() => {
    localStorage.setItem(CONSENT_KEY, "declined");
    setConsent("declined");
    pushDataLayer("cookie_consent", { consent_status: "declined" });
  }, []);

  // Register window.__korvusCMP
  useEffect(() => {
    window.__korvusCMP = {
      accept,
      decline,
      getStatus: () => {
        try {
          return localStorage.getItem(CONSENT_KEY) as ConsentState;
        } catch {
          return null;
        }
      },
    };
  }, [accept, decline]);

  // Don't render until we've read localStorage
  if (consent !== null) return null;

  return (
    <div
      role="dialog"
      aria-label={isFr ? "Consentement aux cookies" : "Cookie consent"}
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-50 bg-white border border-gray-200 rounded-2xl shadow-2xl p-5"
    >
      <div className="flex items-start gap-3">
        <Cookie className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 text-sm mb-1">
            {isFr ? "Nous utilisons des cookies" : "We use cookies"}
          </h3>
          <p className="text-xs text-gray-500 leading-relaxed mb-4">
            {isFr
              ? "Nous utilisons des cookies analytiques et fonctionnels pour améliorer votre expérience. Vous pouvez accepter tous les cookies ou refuser les non-essentiels."
              : "We use analytics and functional cookies to improve your experience. You can accept all cookies or decline non-essential ones."}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={accept}>
              {isFr ? "Tout accepter" : "Accept all"}
            </Button>
            <Button size="sm" variant="outline" onClick={decline}>
              {isFr ? "Refuser" : "Decline"}
            </Button>
          </div>
        </div>
        <button
          onClick={decline}
          className="text-gray-400 hover:text-gray-600 flex-shrink-0"
          aria-label={isFr ? "Fermer" : "Close"}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
