"use client";

import Link from "next/link";
import { Trash2, Plus, Minus, ShoppingBag } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { Button } from "@/components/ui/Button";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { t } from "@/lib/i18n";
import { useLocale } from "@/context/LocaleContext";

export function CartView() {
  const { items, total, removeItem, updateQuantity } = useCart();
  const { locale } = useLocale();

  const FREE_SHIPPING_THRESHOLD = locale === "fr" ? 50 : 50;
  const shippingFee = total >= FREE_SHIPPING_THRESHOLD ? 0 : locale === "fr" ? 5.99 : 6.99;

  const formatAmt = (amount: number) =>
    locale === "fr" ? `${amount.toFixed(2)} €` : `$${amount.toFixed(2)}`;

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
                {/* Image placeholder */}
                <Link href={`/products/${item.slug}`}>
                  <div className="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 text-3xl">
                    📦
                  </div>
                </Link>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/products/${item.slug}`}
                    className="font-semibold text-gray-900 hover:text-blue-700 line-clamp-2 text-sm"
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
                  <p className="text-blue-700 font-bold mt-1">
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
                <span>{formatAmt(total)}</span>
              </div>
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

            <div className="border-t border-gray-100 pt-3 flex justify-between font-bold text-gray-900">
              <span>{t("total", locale)}</span>
              <span>{formatAmt(total + shippingFee)}</span>
            </div>

            <Link href="/checkout">
              <Button fullWidth size="lg">
                {t("proceedToCheckout", locale)}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
