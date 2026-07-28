"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("fr");

  useEffect(() => {
    const savedLocale = window.localStorage.getItem("adh_locale");
    if (savedLocale === "en" || savedLocale === "fr") {
      setLocaleState(savedLocale);
      document.documentElement.lang = savedLocale;
    }
  }, []);

  function setLocale(nextLocale: Locale) {
    setLocaleState(nextLocale);
    window.localStorage.setItem("adh_locale", nextLocale);
    document.documentElement.lang = nextLocale;
  }

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return context;
}
