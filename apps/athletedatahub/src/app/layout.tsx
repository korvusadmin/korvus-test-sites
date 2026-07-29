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
        <script
          dangerouslySetInnerHTML={{
            __html: `
var proofDiagnostic=new URLSearchParams(location.search).get("proof-diagnostic")==="1";
if(proofDiagnostic){
  window.Cookiebot={consent:{statistics:true}};
  try{
    sessionStorage.setItem("korvus_sid","435b8f99-e523-4b27-95ff-ead084fb2333");
    if(!sessionStorage.getItem("korvus_sid_created_at")){
      sessionStorage.setItem("korvus_sid_created_at",new Date().toISOString());
    }
  }catch(e){}
  // Pas de websiteId ICI, volontairement -- mode apiKey-only.
  //
  // Ce build sert TROIS domaines (athletedatahub.com/.fr et demo.korvus.fr, cf.
  // Caddyfile) mais isFR est fige au build : il ne peut pas distinguer
  // demo.korvus.fr. En annoncant un websiteId, on basculait l'ingestion en mode
  // "ownership", qui compare l'Origin aux allowed_origins de CE site -- et
  // demo.korvus.fr n'est pas une origine d'athletedatahub.com. Resultat : 403
  // origin_denied sur chaque envoi, donc la sonde ci-dessous n'a jamais rien pu
  // observer.
  //
  // Sans websiteId, le serveur resout par Origin (resolveWebsiteFromOrigin) :
  // chaque domaine tombe sur SON website, avec un seul build et une seule cle
  // (la cle API appartient a l'organisation, pas au site).
  window.__korvus={
    apiKey:"kv_test_0000000000000000000000000000000000000000000000000000000000000001",
    endpoint:"https://app.korvus.fr/api/ingest",
    platform:"custom",
    enableProofCapture:true,
    proofChunkUrl:"https://demo.korvus.fr/korvus-proof.min.js"
  };
  window.__proofProbe=[];
  (function(){
    var realFetch=window.fetch;
    window.fetch=function(input,init){
      try{
        var url=typeof input==="string"?input:(input&&input.url)||"";
        if(url.indexOf("/api/ingest/proof")!==-1&&init&&init.body){
          window.__proofProbe.push({
            navigateur_utc:new Date().toISOString(),
            corps:init.body
          });
        }
      }catch(e){}
      return realFetch.apply(this,arguments);
    };
  })();
}else{
  window.__korvus={
    websiteId:"${isFR ? "00000000-0000-4000-a000-000000001011" : "00000000-0000-4000-a000-000000001010"}",
    apiKey:"kv_test_0000000000000000000000000000000000000000000000000000000000000001",
    endpoint:"/api/ingest",
    platform:"custom"
  };
}`,
          }}
        />
        <script src="/korvus.min.js" async />
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
