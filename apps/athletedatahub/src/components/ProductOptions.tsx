"use client";

import { useState } from "react";
import type { Product } from "@/types";
import { t } from "@/lib/i18n";
import { AddToCartButton } from "@/components/AddToCartButton";
import { useLocale } from "@/context/LocaleContext";
import { useHasBug } from "@/context/DemoBugContext";

interface ProductOptionsProps {
  product: Product;
}

// Panne de demo `pointure` : une seule pointure d'un seul modele affiche un
// faux message de rupture. Le choix n'est pas anodin -- 42 est la taille
// mediane, donc le coeur du volume, sur le vaisseau amiral trail du catalogue.
// Un faux indisponible sur une taille de bord ne raconterait aucune perte.
const TRAPPED_SLUG = "summit-grip-pro";
const TRAPPED_SIZE = "42";

export function ProductOptions({ product }: ProductOptionsProps) {
  const { locale } = useLocale();
  const fakeOutOfStock = useHasBug("pointure");
  const [selectedVariant, setSelectedVariant] = useState<string | undefined>(
    product.variants[0]
  );
  const [selectedColor, setSelectedColor] = useState<string | undefined>(
    product.colors[0]
  );

  // La premiere variante est pre-selectionnee au montage : le message ne doit
  // donc jamais apparaitre au chargement, seulement apres un clic. C'est ce
  // clic qui est le geste causal filme.
  const showSizeError =
    fakeOutOfStock &&
    product.slug === TRAPPED_SLUG &&
    selectedVariant === TRAPPED_SIZE;

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
                data-korvus-label={`${t("size", locale)} ${v}`}
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
          {/*
            Message INLINE, jamais en modale : [role=dialog] fait partie des
            selecteurs que la politique de masquage ne peut jamais reveler, la
            preuve video montrerait donc une boite d'asterisques a l'endroit
            exact ou vit l'information.
          */}
          {showSizeError && (
            <p
              className="size-error field-error text-sm text-red-600 mt-2"
              role="alert"
              data-error=""
            >
              {t("sizeUnavailable", locale)}
            </p>
          )}
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
