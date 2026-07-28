"use client";

import { useState } from "react";
import type { Product } from "@/types";
import { t } from "@/lib/i18n";
import { AddToCartButton } from "@/components/AddToCartButton";
import { useLocale } from "@/context/LocaleContext";

interface ProductOptionsProps {
  product: Product;
}

export function ProductOptions({ product }: ProductOptionsProps) {
  const { locale } = useLocale();
  const [selectedVariant, setSelectedVariant] = useState<string | undefined>(
    product.variants[0]
  );
  const [selectedColor, setSelectedColor] = useState<string | undefined>(
    product.colors[0]
  );

  return (
    <div className="flex flex-col gap-4">
      {product.variants.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">
            {t("size", locale)}
          </p>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((v) => (
              <button
                key={v}
                onClick={() => setSelectedVariant(v)}
                className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                  selectedVariant === v
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-gray-300 text-gray-700 hover:border-gray-400"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      )}

      {product.colors.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">
            {t("color", locale)}
          </p>
          <div className="flex flex-wrap gap-2">
            {product.colors.map((c) => (
              <button
                key={c}
                onClick={() => setSelectedColor(c)}
                className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                  selectedColor === c
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-gray-300 text-gray-700 hover:border-gray-400"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3 mt-2">
        <AddToCartButton
          product={product}
          selectedVariant={selectedVariant}
          selectedColor={selectedColor}
          size="lg"
        />
      </div>
    </div>
  );
}
