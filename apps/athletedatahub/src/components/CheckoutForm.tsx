"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CreditCard, Lock } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { t, getCurrency } from "@/lib/i18n";
import { useLocale } from "@/context/LocaleContext";
import { useDemoBug } from "@/context/DemoBugContext";
import { gtmPurchase } from "@/lib/gtm";

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  cardNumber: string;
  expiryDate: string;
  cvv: string;
}

const initialForm: FormData = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  postalCode: "",
  country: "",
  cardNumber: "",
  expiryDate: "",
  cvv: "",
};

export function CheckoutForm() {
  const router = useRouter();
  const { items, clearCart } = useCart();
  const { locale } = useLocale();
  const bug = useDemoBug();
  const [form, setForm] = useState<FormData>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [paymentFailed, setPaymentFailed] = useState(false);

  // Meme correction de devise qu'au panier : le total du contexte est en prix
  // EN alors que les lignes sont affichees en priceFr.
  const total = items.reduce(
    (sum, i) => sum + (locale === "fr" ? i.priceFr : i.price) * i.quantity,
    0
  );
  const FREE_SHIPPING_THRESHOLD = 50;
  const shippingFee = total >= FREE_SHIPPING_THRESHOLD ? 0 : locale === "fr" ? 5.99 : 6.99;
  const grandTotal = total + shippingFee;

  const formatAmt = (amount: number) =>
    locale === "fr" ? `${amount.toFixed(2)} €` : `$${amount.toFixed(2)}`;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setPaymentFailed(false);

    const orderNumber = `ADH-${Date.now().toString(36).toUpperCase()}`;
    const currency = getCurrency(locale);

    let approved = false;
    try {
      const res = await fetch("/api/paiement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: grandTotal, currency, bug }),
      });
      approved = res.ok;
    } catch {
      approved = false;
    }

    if (!approved) {
      setPaymentFailed(true);
      setSubmitting(false);
      return;
    }

    // gtmPurchase APRES l'autorisation, jamais avant : un purchase pousse sur
    // un paiement refuse ferait mentir le dataLayer, et n'importe quel prospect
    // qui ouvre la console pendant la demo le verrait.
    gtmPurchase({
      orderNumber,
      items: items.map((i) => ({
        id: i.productId,
        name: locale === "fr" ? i.nameFr : i.name,
        category: "unknown",
        price: locale === "fr" ? i.priceFr : i.price,
        quantity: i.quantity,
      })),
      total: grandTotal,
      currency,
    });
    clearCart();
    router.push(`/checkout/confirmation?order=${orderNumber}`);
  }

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <p className="text-gray-600 mb-4">{t("emptyCart", locale)}</p>
        <Link href="/catalog">
          <Button>{t("continueShopping", locale)}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <Breadcrumbs
        items={[
          { label: t("home", locale), href: "/" },
          { label: t("cart", locale), href: "/cart" },
          { label: t("checkout", locale) },
        ]}
      />

      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t("checkoutTitle", locale)}</h1>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 space-y-6">
          {/* Contact Info */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="font-bold text-gray-900">{t("contactInfo", locale)}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                id="firstName"
                name="firstName"
                label={t("firstName", locale)}
                value={form.firstName}
                onChange={handleChange}
                required
                autoComplete="given-name"
              />
              <Input
                id="lastName"
                name="lastName"
                label={t("lastName", locale)}
                value={form.lastName}
                onChange={handleChange}
                required
                autoComplete="family-name"
              />
            </div>
            <Input
              id="email"
              name="email"
              type="email"
              label={t("email", locale)}
              value={form.email}
              onChange={handleChange}
              required
              autoComplete="email"
            />
            <Input
              id="phone"
              name="phone"
              type="tel"
              label={t("phone", locale)}
              value={form.phone}
              onChange={handleChange}
              autoComplete="tel"
            />
          </section>

          {/* Shipping Address */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="font-bold text-gray-900">{t("shippingAddress", locale)}</h2>
            <Input
              id="address"
              name="address"
              label={t("address", locale)}
              value={form.address}
              onChange={handleChange}
              required
              autoComplete="street-address"
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                id="city"
                name="city"
                label={t("city", locale)}
                value={form.city}
                onChange={handleChange}
                required
                autoComplete="address-level2"
              />
              <Input
                id="postalCode"
                name="postalCode"
                label={t("postalCode", locale)}
                value={form.postalCode}
                onChange={handleChange}
                required
                autoComplete="postal-code"
              />
              <Input
                id="country"
                name="country"
                label={t("country", locale)}
                value={form.country}
                onChange={handleChange}
                required
                autoComplete="country-name"
                placeholder={locale === "fr" ? "France" : "United States"}
              />
            </div>
          </section>

          {/* Payment */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-gray-900">{t("paymentInfo", locale)}</h2>
              <Lock className="w-4 h-4 text-gray-400" />
            </div>
            <Input
              id="cardNumber"
              name="cardNumber"
              label={t("cardNumber", locale)}
              value={form.cardNumber}
              onChange={handleChange}
              required
              placeholder="4242 4242 4242 4242"
              maxLength={19}
              autoComplete="cc-number"
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                id="expiryDate"
                name="expiryDate"
                label={t("expiryDate", locale)}
                value={form.expiryDate}
                onChange={handleChange}
                required
                placeholder="MM/YY"
                maxLength={5}
                autoComplete="cc-exp"
              />
              <Input
                id="cvv"
                name="cvv"
                label={t("cvv", locale)}
                value={form.cvv}
                onChange={handleChange}
                required
                placeholder="123"
                maxLength={4}
                autoComplete="cc-csc"
              />
            </div>
            <div className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2">
              <CreditCard className="w-4 h-4 text-blue-500 flex-shrink-0" />
              <p className="text-xs text-blue-700">
                {locale === "fr"
                  ? "Paiement simulé — aucune donnée réelle n'est traitée."
                  : "Simulated payment — no real data is processed."}
              </p>
            </div>
          </section>

          {/*
            Message INLINE dans le flux du formulaire, juste au-dessus du CTA.
            Ni modale ni drawer : [role=dialog] n'est jamais revelable par la
            politique de masquage, la preuve video afficherait des asterisques
            a l'endroit exact ou se joue toute l'histoire.
          */}
          {paymentFailed && (
            <p
              className="checkout-error form-error text-sm text-red-600"
              role="alert"
              data-error=""
            >
              {t("paymentDeclined", locale)}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            fullWidth
            disabled={submitting}
            data-korvus-label={t("placeOrder", locale)}
          >
            {submitting ? t("orderProcessing", locale) : t("placeOrder", locale)}
          </Button>
        </form>

        {/* Order Summary */}
        <div className="w-full lg:w-80 flex-shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 p-6 sticky top-20">
            <h2 className="font-bold text-gray-900 mb-4">{t("orderSummary", locale)}</h2>
            <ul className="space-y-3 mb-4">
              {items.map((item) => {
                const name = locale === "fr" ? item.nameFr : item.name;
                const price = locale === "fr" ? item.priceFr : item.price;
                return (
                  <li
                    key={item.productId}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="text-gray-700 line-clamp-1 flex-1">
                      {name}
                      <span className="text-gray-400 ml-1">×{item.quantity}</span>
                    </span>
                    <span className="font-medium text-gray-900 flex-shrink-0">
                      {formatAmt(price * item.quantity)}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-gray-100 pt-3 space-y-2 text-sm">
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
            </div>
            <div className="border-t border-gray-200 mt-3 pt-3 flex justify-between font-bold text-gray-900">
              <span>{t("total", locale)}</span>
              <span className="text-blue-700 text-lg">{formatAmt(grandTotal)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
