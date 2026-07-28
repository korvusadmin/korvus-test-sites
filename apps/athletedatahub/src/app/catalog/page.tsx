"use client";

import Link from "next/link";
import { getAllProducts } from "@/lib/products";
import { ProductCard } from "@/components/ProductCard";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { t } from "@/lib/i18n";
import { useLocale } from "@/context/LocaleContext";

export default function CatalogPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const products = getAllProducts();

  const categoryLinks = [
    ["running", "Running"],
    ["trail", "Trail"],
    ["triathlon", "Triathlon"],
    ["cycling", fr ? "Vélo" : "Cycling"],
    ["equipment", t("equipment", locale)],
    ["nutrition", t("nutrition", locale)],
  ].map(([key, label]) => ({
    href: `/catalog/${key}`,
    label,
    count: products.filter((p) => p.category === key).length,
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Breadcrumbs
        items={[
          { label: t("home", locale), href: "/" },
          { label: t("catalog", locale) },
        ]}
      />

      <div className="mb-10 bg-[#07111f] text-white px-7 py-10 md:px-10">
        <p className="text-xs uppercase tracking-[0.18em] text-[#d8ff3e] font-bold mb-2">AthleteDataHub · {fr ? "Boutique endurance" : "Endurance store"}</p>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight">{fr ? "Tout l’équipement pour aller plus loin" : "All the gear to go further"}</h1>
        <p className="text-slate-300 mt-3 max-w-2xl">{fr ? "Running, trail, triathlon, électronique et nutrition : 30 références choisies pour accompagner vos objectifs." : "Running, trail, triathlon, electronics and nutrition: 30 products selected to support your goals."}</p>
      </div>
      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar */}
        <aside className="w-full md:w-56 flex-shrink-0">
          <div className="bg-white border border-gray-200 p-4 sticky top-32">
            <h3 className="font-semibold text-gray-900 mb-3">{t("categories", locale)}</h3>
            <ul className="space-y-1">
              <li>
                <Link
                  href="/catalog"
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-blue-50 text-blue-700 font-medium text-sm"
                >
                  <span>{t("allCategories", locale)}</span>
                  <span className="text-xs bg-blue-100 px-2 py-0.5 rounded-full">
                    {products.length}
                  </span>
                </Link>
              </li>
              {categoryLinks.map((cat) => (
                <li key={cat.href}>
                  <Link
                    href={cat.href}
                    className="flex items-center justify-between px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 text-sm transition-colors"
                  >
                    <span>{cat.label}</span>
                    <span className="text-xs text-gray-400">{cat.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-2xl font-black text-gray-900">{t("catalog", locale)}</h2>
            <p className="text-sm text-gray-500">
              {t("showing", locale)} {products.length} {t("products", locale)}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
