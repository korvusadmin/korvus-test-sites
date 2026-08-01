"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Trash2, Plus, Minus, ShoppingBag } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { Button } from "@/components/ui/Button";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PromoCodeForm } from "@/components/PromoCodeForm";
import {
  FREE_SHIPPING_THRESHOLD,
  formatAmount,
  readAppliedPromo,
  shippingFeeFor,
  subtotalFor,
} from "@/lib/cart-totals";
import { t } from "@/lib/i18n";
import { useLocale } from "@/context/LocaleContext";

export function CartView() {
  const { items, removeItem, updateQuantity } = useCart();
  const { locale } = useLocale();
  const [discountRate, setDiscountRate] = useState(0);

  // Lecture apres montage : sessionStorage n'existe pas au rendu serveur, et
  // un etat initial different des deux cotes ferait diverger l'hydratation.
  useEffect(() => {
    setDiscountRate(readAppliedPromo()?.rate ?? 0);
  }, []);

  const subtotal = subtotalFor(items, locale);
  const discount = subtotal * discountRate;
  const total = subtotal - discount;
  const shippingFee = shippingFeeFor(total, locale);

  const formatAmt = (amount: number) => formatAmount(amount, locale);

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Breadcrumbs
          items={[
            { label: t("home", locale), href: "/" },
            { label: t("cart", locale) },
          ]}
        />
        <div className="flex flex-col items-center justify-center py-24 gap-5">
          <ShoppingBag className="w-20 h-20 text-gray-300" />
          <h2 className="text-2xl font-bold text-gray-700">{t("emptyCart", locale)}</h2>
          <Link href="/catalog">
            <Button size="lg">{t("continueShopping", locale)}</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <Breadcrumbs
        items={[
          { label: t("home", locale), href: "/" },
          { label: t("cart", locale) },
        ]}
      />

      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t("yourCart", locale)}</h1>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Items */}
        <div className="flex-1 min-w-0 space-y-4">
          {items.map((item) => {
            const name = locale === "fr" ? item.nameFr : item.name;
            const itemPrice = locale === "fr" ? item.priceFr : item.price;
            return (
              <div
                key={item.productId}
                className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4"
              >
                {/*
                  Vraie photo produit, comme la vignette du catalogue
                  (ProductCard). Le panier affichait un emoji alors que
                  `item.image` etait deja porte par le CartItem : sur une capture
                  de demo, trois cartons marron a la place des produits font
                  maquette, pas boutique.

                  `sizes="80px"` colle a la boite w-20/h-20 : sans lui, Next
                  sert une image dimensionnee pour le viewport entier.
                */}
                <Link href={`/products/${item.slug}`}>
                  <div className="relative w-20 h-20 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                    <Image
                      src={item.image}
                      alt={name}
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  </div>
                </Link>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/products/${item.slug}`}
                    className="cart-line-title font-semibold text-gray-900 hover:text-blue-700 line-clamp-2 text-sm"
                  >
                    {name}
                  </Link>
                  {item.selectedVariant && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {t("size", locale)}: {item.selectedVariant}
                    </p>
                  )}
                  {item.selectedColor && (
                    <p className="text-xs text-gray-500">
                      {t("color", locale)}: {item.selectedColor}
                    </p>
                  )}
                  <p className="cart-line-price text-blue-700 font-bold mt-1">
                    {formatAmt(itemPrice)}
                  </p>
                </div>

                {/* Qty controls */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() =>
                      updateQuantity(item.productId, item.quantity - 1)
                    }
                    className="w-7 h-7 rounded-lg border border-gray-300 flex items-center justify-center hover:bg-gray-100 transition-colors"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-8 text-center text-sm font-semibold">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() =>
                      updateQuantity(item.productId, item.quantity + 1)
                    }
                    className="w-7 h-7 rounded-lg border border-gray-300 flex items-center justify-center hover:bg-gray-100 transition-colors"
                    aria-label="Increase quantity"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Line total */}
                <div className="text-right flex-shrink-0 hidden sm:block">
                  <p className="font-bold text-gray-900">
                    {formatAmt(itemPrice * item.quantity)}
                  </p>
                </div>

                {/* Remove */}
                <button
                  onClick={() => removeItem(item.productId)}
                  className="p-2 text-gray-400 hover:text-red-600 transition-colors flex-shrink-0"
                  aria-label={t("remove", locale)}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}

          <div className="flex justify-between items-center pt-2">
            <Link href="/catalog">
              <Button variant="ghost" size="sm">
                ← {t("continueShopping", locale)}
              </Button>
            </Link>
          </div>
        </div>

        {/* Summary */}
        <div className="w-full lg:w-80 flex-shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 sticky top-20">
            <h2 className="font-bold text-gray-900 text-lg">{t("orderSummary", locale)}</h2>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>{t("subtotal", locale)}</span>
                <span className="cart-subtotal">{formatAmt(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-green-700 font-medium">
                  <span>{t("discount", locale)}</span>
                  <span>-{formatAmt(discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-600">
                <span>{t("shipping", locale)}</span>
                <span className={shippingFee === 0 ? "text-green-600 font-medium" : ""}>
                  {shippingFee === 0 ? t("free", locale) : formatAmt(shippingFee)}
                </span>
              </div>
              {shippingFee > 0 && (
                <p className="text-xs text-gray-400">
                  {locale === "fr"
                    ? `Plus que ${formatAmt(FREE_SHIPPING_THRESHOLD - total)} pour la livraison gratuite`
                    : `${formatAmt(FREE_SHIPPING_THRESHOLD - total)} away from free shipping`}
                </p>
              )}
            </div>

            <PromoCodeForm onApplied={setDiscountRate} />

            <div className="border-t border-gray-100 pt-3 flex justify-between font-bold text-gray-900">
              <span>{t("total", locale)}</span>
              <span className="cart-total">{formatAmt(total + shippingFee)}</span>
            </div>

            <Link href="/checkout">
              <Button fullWidth size="lg" className="cta-label" data-korvus-label={t("proceedToCheckout", locale)}>
                {t("proceedToCheckout", locale)}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
