"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { en, TranslationKeys } from "./locales/en";
import { zh } from "./locales/zh";

export type Locale = "en" | "zh";

const locales: Record<Locale, TranslationKeys> = {
  en,
  zh,
};

export const localeNames: Record<Locale, string> = {
  en: "English",
  zh: "简体中文",
};

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslationKeys;
}

const I18nContext = createContext<I18nContextType | null>(null);

const LOCALE_STORAGE_KEY = "morphshop-locale";

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return "en";

  // Check localStorage first
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored === "en" || stored === "zh") return stored;

  // Check browser language
  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith("zh")) return "zh";

  return "en";
}

interface I18nProviderProps {
  children: ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setLocaleState(getInitialLocale());
    setMounted(true);
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    if (typeof window !== "undefined") {
      localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
      // Update html lang attribute
      document.documentElement.lang = newLocale === "zh" ? "zh-CN" : "en";
    }
  }, []);

  const t = locales[locale];

  // Prevent hydration mismatch by rendering with default locale until mounted
  if (!mounted) {
    return (
      <I18nContext.Provider value={{ locale: "en", setLocale, t: en }}>
        {children}
      </I18nContext.Provider>
    );
  }

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}

export function useTranslation() {
  const { t } = useI18n();
  return t;
}
