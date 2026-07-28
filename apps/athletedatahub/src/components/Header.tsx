"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingCart, Menu, X, Search, UserRound, Activity } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/context/CartContext";
import { t } from "@/lib/i18n";
import { useLocale } from "@/context/LocaleContext";

export function Header() {
  const { itemCount } = useCart();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { locale, setLocale } = useLocale();
  const fr = locale === "fr";

  const navLinks = [
    { href: "/catalog/running", label: "Running" },
    { href: "/catalog/trail", label: "Trail" },
    { href: "/catalog/triathlon", label: "Triathlon" },
    { href: "/catalog/cycling", label: fr ? "Vélo" : "Cycling" },
    { href: "/catalog/equipment", label: fr ? "Équipement" : "Equipment" },
    { href: "/catalog/nutrition", label: "Nutrition" },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/95 border-b border-slate-200 backdrop-blur">
      <div className="bg-[#07111f] text-white text-[11px] tracking-wide">
        <div className="max-w-7xl mx-auto px-4 h-8 flex items-center justify-between">
          <span>{fr ? "Livraison offerte dès 75 € · Retours sous 30 jours" : "Free shipping over €75 · 30-day returns"}</span>
          <span className="hidden sm:inline">{fr ? "Conseils experts au 04 12 34 56 78" : "Expert advice at +33 4 12 34 56 78"}</span>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-[72px]">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 text-[#07111f] transition-colors"
          >
            <span className="w-9 h-9 bg-[#d8ff3e] rounded-full flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </span>
            <span className="font-black tracking-[-0.04em] text-xl">ATHLETE<span className="font-medium">DATAHUB</span></span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className="text-sm font-semibold text-slate-700 hover:text-black transition-colors">
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Search */}
          <form
            className="hidden md:flex items-center"
            onSubmit={(e) => {
              e.preventDefault();
              if (searchQuery.trim()) {
                router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
              }
            }}
          >
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("searchPlaceholder", locale)}
                className="w-44 xl:w-52 pl-9 pr-3 py-2 text-sm bg-slate-100 border border-transparent rounded-full focus:outline-none focus:ring-2 focus:ring-[#9fc400]"
              />
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            </div>
          </form>

          {/* Cart + Mobile menu */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setLocale(fr ? "en" : "fr")}
              className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-100"
              aria-label={fr ? "Switch to English" : "Passer en français"}
              title={fr ? "English" : "Français"}
            >
              <span aria-hidden="true" className="text-lg leading-none">{fr ? "🇬🇧" : "🇫🇷"}</span>
              <span className="hidden xl:inline">{fr ? "EN" : "FR"}</span>
            </button>
            <button className="hidden sm:flex p-2 text-slate-700" aria-label={fr ? "Mon compte" : "My account"}>
              <UserRound className="w-5 h-5" />
            </button>
            <Link
              href="/cart"
              className="relative flex items-center gap-1 p-2 rounded-full hover:bg-slate-100 transition-colors text-slate-700"
              aria-label={t("cart", locale)}
            >
              <ShoppingCart className="w-5 h-5" />
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#d8ff3e] text-[#07111f] text-xs font-black flex items-center justify-center">
                  {itemCount > 99 ? "99+" : itemCount}
                </span>
              )}
              <span className="hidden sm:inline text-sm font-medium">
                {t("cart", locale)}
              </span>
            </Link>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-700"
              aria-label={fr ? "Ouvrir le menu" : "Toggle menu"}
            >
              {menuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="lg:hidden border-t border-gray-200 bg-white">
          <nav className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-1">
            <form
              className="mb-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (searchQuery.trim()) {
                  router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
                  setMenuOpen(false);
                }
              }}
            >
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("searchPlaceholder", locale)}
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              </div>
            </form>
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="py-2 px-3 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-blue-700 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
