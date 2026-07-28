import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { CartProvider } from "@/context/CartContext";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { GTMPageView } from "@/components/GTMPageView";
import { CookieBanner } from "@/components/CookieBanner";
import { LocaleProvider } from "@/context/LocaleContext";

const isFR = process.env.NEXT_PUBLIC_LOCALE !== "EN";

export const metadata: Metadata = {
  title: {
    default: isFR
      ? "AthleteDataHub – Running, Trail & Triathlon"
      : "AthleteDataHub – Running, Trail & Triathlon",
    template: "%s | AthleteDataHub",
  },
  description: isFR
    ? "Running, trail et triathlon : équipement, nutrition et conseils sélectionnés par des athlètes."
    : "Expert-selected running, trail and triathlon gear, nutrition and advice.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang={isFR ? "fr" : "en"}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "window.dataLayer=window.dataLayer||[];" }} />
        {/* Fake Meta Pixel (fbq) — simulates pixel presence for testing */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.fbq=function(){window.__korvusTagLog=window.__korvusTagLog||[];window.__korvusTagLog.push({tag:"meta_pixel",args:[].slice.call(arguments),ts:Date.now()});};`,
          }}
        />
        {/* Fake GA4 (gtag) — simulates pixel presence for testing */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.gtag=function(){window.__korvusTagLog=window.__korvusTagLog||[];window.__korvusTagLog.push({tag:"ga4",args:[].slice.call(arguments),ts:Date.now()});};`,
          }}
        />
        {/* INJECT_SCRIPTS */}
        <script dangerouslySetInnerHTML={{ __html: `window.__korvus={websiteId:"${isFR ? "00000000-0000-4000-a000-000000001011" : "00000000-0000-4000-a000-000000001010"}",apiKey:"kv_test_0000000000000000000000000000000000000000000000000000000000000001",endpoint:"/api/ingest",platform:"custom"};` }} />
        <script src="/api/snippet/korvus.min.js" defer />
      </head>
      <body className="min-h-screen flex flex-col bg-[#fafaf7] text-[#07111f]">
        <LocaleProvider>
          <CartProvider>
            <Suspense fallback={null}>
              <GTMPageView />
            </Suspense>
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
            <CookieBanner />
          </CartProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
