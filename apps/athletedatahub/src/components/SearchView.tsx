"use client";

import { Search } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ProductCard } from "@/components/ProductCard";
import { useLocale } from "@/context/LocaleContext";
import { t } from "@/lib/i18n";
import type { Product } from "@/types";

export function SearchView({ query, products }: { query: string; products: Product[] }) {
  const { locale } = useLocale();
  const results = query
    ? products.filter((product) =>
        (locale === "fr" ? product.nameFr : product.name)
          .toLowerCase()
          .includes(query.toLowerCase())
      )
    : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <Breadcrumbs items={[
        { label: t("home", locale), href: "/" },
        { label: t("searchResults", locale) },
      ]} />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {query ? `${t("searchResultsFor", locale)} "${query}"` : t("searchResults", locale)}
        </h1>
        {query && <p className="search-results-count text-sm text-gray-500 mt-1">{results.length} {t("products", locale)}</p>}
      </div>
      {!query && (
        <div className="text-center py-16 text-gray-400">
          <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">{t("searchPlaceholder", locale)}</p>
        </div>
      )}
      {query && results.length === 0 && (
        <div className="text-center py-16" data-search-no-results>
          <Search className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p className="text-lg font-medium text-gray-700">{t("noResults", locale)}</p>
          <p className="text-sm text-gray-500 mt-1">{t("noResultsMessage", locale)}</p>
        </div>
      )}
      {results.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {results.map((product) => <ProductCard key={product.id} product={product} />)}
        </div>
      )}
    </div>
  );
}
