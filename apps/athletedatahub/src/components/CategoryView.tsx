"use client";

import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ProductCard } from "@/components/ProductCard";
import { useLocale } from "@/context/LocaleContext";
import { t } from "@/lib/i18n";
import type { Category, Product } from "@/types";

const categoryLabels: Record<Category, { en: string; fr: string }> = {
  running: { en: "Running", fr: "Running" },
  trail: { en: "Trail", fr: "Trail" },
  triathlon: { en: "Triathlon", fr: "Triathlon" },
  cycling: { en: "Cycling", fr: "Vélo" },
  equipment: { en: "Equipment", fr: "Équipements" },
  nutrition: { en: "Nutrition", fr: "Nutrition" },
};

export function CategoryView({
  category,
  products,
}: {
  category: Category;
  products: Product[];
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const catLabel = categoryLabels[category][locale];
  const otherCategories = (Object.keys(categoryLabels) as Category[]).filter(
    (candidate) => candidate !== category
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Breadcrumbs
        items={[
          { label: t("home", locale), href: "/" },
          { label: t("catalog", locale), href: "/catalog" },
          { label: catLabel },
        ]}
      />
      <div className="bg-[#07111f] text-white px-8 py-10 mb-8">
        <p className="text-xs uppercase tracking-[0.18em] text-[#d8ff3e] font-bold mb-2">
          {fr ? "Sélection AthleteDataHub" : "AthleteDataHub selection"}
        </p>
        <h1 className="plp-title text-4xl md:text-5xl font-black">{catLabel}</h1>
        <p className="text-slate-300 mt-2">
          {fr
            ? "Notre sélection testée et approuvée pour vos entraînements et vos courses."
            : "Our tested and approved selection for training and race day."}
        </p>
      </div>
      <div className="flex flex-col md:flex-row gap-8">
        <aside className="w-full md:w-56 flex-shrink-0">
          <div className="bg-white border border-gray-200 p-4 sticky top-32">
            <h3 className="font-semibold text-gray-900 mb-3">{t("categories", locale)}</h3>
            <ul className="space-y-1">
              <li>
                <Link href="/catalog" className="flex items-center px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 text-sm">
                  {t("allCategories", locale)}
                </Link>
              </li>
              <li>
                <span className="flex items-center justify-between px-3 py-2 rounded-lg bg-blue-50 text-blue-700 font-medium text-sm">
                  <span>{catLabel}</span>
                  <span className="text-xs bg-blue-100 px-2 py-0.5 rounded-full">{products.length}</span>
                </span>
              </li>
              {otherCategories.map((otherCategory) => (
                <li key={otherCategory}>
                  <Link href={`/catalog/${otherCategory}`} className="flex items-center px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 text-sm">
                    {categoryLabels[otherCategory][locale]}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-2xl font-black text-gray-900">{catLabel}</h2>
            <p className="text-sm text-gray-500">
              {t("showing", locale)} {products.length} {t("products", locale)}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {products.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
