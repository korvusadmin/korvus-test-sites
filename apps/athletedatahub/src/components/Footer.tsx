"use client";

import Link from "next/link";
import { Activity, Instagram, Facebook, Youtube } from "lucide-react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/context/LocaleContext";

export function Footer() {
  const currentYear = new Date().getFullYear();
  const { locale } = useLocale();

  return (
    <footer className="bg-[#07111f] text-slate-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link
              href="/"
              className="flex items-center gap-2 font-black text-xl text-white mb-3 tracking-tight"
            >
              <span className="w-8 h-8 rounded-full bg-[#d8ff3e] text-[#07111f] flex items-center justify-center"><Activity className="w-4 h-4" /></span>
              <span>AthleteDataHub</span>
            </Link>
            <p className="text-sm text-gray-400">{t("footerTagline", locale)}</p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold text-white mb-3">{t("quickLinks", locale)}</h3>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/"
                  className="text-sm hover:text-white transition-colors"
                >
                  {t("home", locale)}
                </Link>
              </li>
              <li>
                <Link
                  href="/catalog"
                  className="text-sm hover:text-white transition-colors"
                >
                  {t("catalog", locale)}
                </Link>
              </li>
              <li>
                <Link
                  href="/cart"
                  className="text-sm hover:text-white transition-colors"
                >
                  {t("cart", locale)}
                </Link>
              </li>
            </ul>
          </div>

          {/* Categories */}
          <div>
            <h3 className="font-semibold text-white mb-3">{t("categories", locale)}</h3>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/catalog/running"
                  className="text-sm hover:text-white transition-colors"
                >
                  Running
                </Link>
              </li>
              <li>
                <Link
                  href="/catalog/trail"
                  className="text-sm hover:text-white transition-colors"
                >
                  Trail
                </Link>
              </li>
              <li>
                <Link
                  href="/catalog/triathlon"
                  className="text-sm hover:text-white transition-colors"
                >
                  Triathlon
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="font-semibold text-white mb-3">{t("support", locale)}</h3>
            <ul className="space-y-2">
              <li>
                <span className="text-sm cursor-default">{t("contactUs", locale)}</span>
              </li>
              <li>
                <span className="text-sm cursor-default">{t("faq", locale)}</span>
              </li>
              <li>
                <span className="text-sm cursor-default">{t("returns", locale)}</span>
              </li>
              <li>
                <span className="text-sm cursor-default">{t("privacy", locale)}</span>
              </li>
              <li>
                <span className="text-sm cursor-default">{t("terms", locale)}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-800 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            &copy; {currentYear} AthleteDataHub. {t("allRightsReserved", locale)}
          </p>
          <div className="flex items-center gap-4 text-slate-400"><Instagram className="w-4 h-4" /><Facebook className="w-4 h-4" /><Youtube className="w-4 h-4" /></div>
        </div>
      </div>
    </footer>
  );
}
