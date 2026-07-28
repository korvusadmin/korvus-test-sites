"use client";

import Link from "next/link";
import Image from "next/image";
import { Star, Heart } from "lucide-react";
import type { Product } from "@/types";
import { formatPrice } from "@/lib/i18n";
import { useLocale } from "@/context/LocaleContext";
import { AddToCartButton } from "@/components/AddToCartButton";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const { locale } = useLocale();
  const name = locale === "fr" ? product.nameFr : product.name;
  const price = formatPrice(product.price, product.priceFr, locale);

  return (
    <article className="group bg-white border border-slate-200 hover:border-slate-400 transition-all overflow-hidden flex flex-col">
      {/* Image */}
      <Link href={`/products/${product.slug}`} className="block overflow-hidden">
        <div
          className="aspect-[4/5] bg-[#f4f5f2] relative overflow-hidden"
          style={{ position: "relative", aspectRatio: "4 / 5" }}
        >
          <Image src={product.image} alt={name} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" className="object-cover group-hover:scale-[1.03] transition-transform duration-500" />
          {product.badge && <span className="absolute left-3 top-3 bg-[#d8ff3e] text-[#07111f] text-[10px] uppercase tracking-wider font-black px-2.5 py-1">{product.badge}</span>}
          <button aria-label={locale === "fr" ? "Ajouter aux favoris" : "Add to favourites"} className="absolute right-3 top-3 w-9 h-9 rounded-full bg-white/90 flex items-center justify-center">
            <Heart className="w-4 h-4" />
          </button>
          {!product.inStock && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
              <span className="bg-gray-800 text-white text-xs font-semibold px-3 py-1 rounded-full">
                {locale === "fr" ? "Rupture de stock" : "Out of Stock"}
              </span>
            </div>
          )}
        </div>
      </Link>

      {/* Content */}
      <div className="flex flex-col flex-1 p-4 gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">{product.brand}</p>
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/products/${product.slug}`}
            className="text-[15px] font-bold text-[#07111f] hover:underline transition-colors line-clamp-2 leading-snug"
          >
            {name}
          </Link>
        </div>

        {/* Rating */}
        <div className="flex items-center gap-1">
          <div className="flex">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`w-3.5 h-3.5 ${
                  i < Math.floor(product.rating)
                    ? "fill-yellow-400 text-yellow-400"
                    : i < product.rating
                    ? "fill-yellow-200 text-yellow-400"
                    : "text-gray-300"
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-gray-500">({product.reviewCount})</span>
        </div>

        {/* Price + CTA */}
        <div className="flex items-center justify-between gap-2 mt-auto pt-2">
          <span className="text-lg font-black text-[#07111f]">{price}</span>
          <AddToCartButton product={product} size="sm" />
        </div>
      </div>
    </article>
  );
}
