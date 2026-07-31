"use client";

import Image from "next/image";
import { Package, Shield, Star } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ProductCard } from "@/components/ProductCard";
import { ProductOptions } from "@/components/ProductOptions";
import { ViewItemTracker } from "@/components/ViewItemTracker";
import { useLocale } from "@/context/LocaleContext";
import { formatPrice, getCurrency, t } from "@/lib/i18n";
import type { Product } from "@/types";

const categoryLabels: Record<string, { en: string; fr: string }> = {
  running: { en: "Running", fr: "Running" },
  trail: { en: "Trail", fr: "Trail" },
  triathlon: { en: "Triathlon", fr: "Triathlon" },
  cycling: { en: "Cycling", fr: "Vélo" },
  equipment: { en: "Equipment", fr: "Équipements" },
  nutrition: { en: "Nutrition", fr: "Nutrition" },
};

export function ProductView({ product, related }: { product: Product; related: Product[] }) {
  const { locale } = useLocale();
  const name = locale === "fr" ? product.nameFr : product.name;
  const description = locale === "fr" ? product.descriptionFr : product.description;
  const price = formatPrice(product.price, product.priceFr, locale);
  const rawPrice = locale === "fr" ? product.priceFr : product.price;
  const currency = getCurrency(locale);
  const catLabel = categoryLabels[product.category]?.[locale] ?? product.category;

  return (
    <>
      <ViewItemTracker id={product.id} name={name} category={product.category} price={rawPrice} currency={currency} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Breadcrumbs items={[
          { label: t("home", locale), href: "/" },
          { label: t("catalog", locale), href: "/catalog" },
          { label: catLabel, href: `/catalog/${product.category}` },
          { label: name },
        ]} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mt-5">
          <div
            className="relative aspect-[4/5] overflow-hidden bg-[#f3f4ef]"
            style={{ position: "relative", aspectRatio: "4 / 5" }}
          >
            <Image src={product.image} alt={name} fill priority sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Badge variant="info" className="capitalize">{catLabel}</Badge>
              <Badge variant={product.inStock ? "success" : "danger"}>
                {t(product.inStock ? "inStock" : "outOfStock", locale)}
              </Badge>
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{product.brand}</p>
            <h1 className="product-title text-4xl lg:text-5xl font-black tracking-tight text-[#07111f]">{name}</h1>
            <div className="flex items-center gap-2">
              <div className="flex">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Star
                    key={index}
                    className={`w-5 h-5 ${index < Math.floor(product.rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`}
                  />
                ))}
              </div>
              <span className="text-sm font-medium text-gray-700">{product.rating}</span>
              <span className="text-sm text-gray-400">({product.reviewCount} {t("reviews", locale)})</span>
            </div>
            <div className="product-price text-3xl font-black text-[#07111f]">{price}</div>
            <p className="text-gray-600 leading-relaxed">{description}</p>
            <div className="flex flex-wrap gap-2">
              {product.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
            </div>
            <ProductOptions product={product} />
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Package className="w-4 h-4 text-blue-500" />
                {t("freeShippingDesc", locale)}
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Shield className="w-4 h-4 text-blue-500" />
                {locale === "fr" ? "Retours sous 30 jours" : "30-day easy returns"}
              </div>
            </div>
          </div>
        </div>
        {related.length > 0 && (
          <section className="mt-16">
            <h2 className="text-xl font-bold text-gray-900 mb-6">{t("relatedProducts", locale)}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {related.map((relatedProduct) => <ProductCard key={relatedProduct.id} product={relatedProduct} />)}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
