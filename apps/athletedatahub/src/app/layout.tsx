import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { CartProvider } from "@/context/CartContext";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { GTMPageView } from "@/components/GTMPageView";
import { CookieBanner } from "@/components/CookieBanner";
import { LocaleProvider } from "@/context/LocaleContext";
import { DemoBugProvider } from "@/context/DemoBugContext";

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
var __sp=new URLSearchParams(location.search);
function __ssGet(k){try{return sessionStorage.getItem(k);}catch(e){return null;}}
function __ssSet(k,v){try{sessionStorage.setItem(k,v);}catch(e){}}

// Tire un UUID v4 garanti dans les 25 % echantillonnes par la preuve video.
//
// L'echantillonnage est DETERMINISTE sur un hash djb2 du session_id (cf.
// snippet/src/proof/sampling.ts + url-sanitizer.ts) : sessionSamplingValue =
// parseInt(djb2Hash(sid),16) / 2^32, filme si < 0.25. Autrement dit, filme si
// le hash non signe est < 2^30. On peut donc pre-selectionner les sid et
// obtenir 100 % de sessions capturees, au lieu d'une sur quatre.
function __sampledUuid(){
  function h(s){var x=5381;for(var i=0;i<s.length;i++){x=((x<<5)+x)+s.charCodeAt(i);}return x>>>0;}
  try{
    for(var i=0;i<400;i++){
      var u=crypto.randomUUID();
      if(h(u)<1073741824)return u;
    }
  }catch(e){}
  return "435b8f99-e523-4b27-95ff-ead084fb2333"; // repli : sid historique, valeur 0.0827
}

// MODE TOURNAGE (?film=1 ou ?film=new) -- volontairement DISTINCT de
// ?proof-diagnostic=1, et collant a l'onglet.
//
// Deux besoins que le mode diagnostic ne sait pas couvrir :
//  - une session DIFFERENTE par prise (l'ancien code epinglait un sid en dur,
//    identique a toutes les visites : impossible de produire deux preuves
//    distinctes, et le moteur exige >= 5 sessions par signature) ;
//  - un mode qui survive a la navigation entre pages sans reporter le parametre,
//    pour que le geste causal de la page precedente entre dans le film.
//
// Le diagnostic, lui, doit rester NON collant : le test E2E verifie qu'une
// visite normale apres une visite diagnostic retombe sur enabled:false.
var __filmParam=__sp.get("film");
var __film=__filmParam!==null||__ssGet("adh_film")==="1";
if(__film){
  __ssSet("adh_film","1");
  var __sid=__ssGet("korvus_sid");
  var __uuidRe=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  // Le sid epingle du mode diagnostic est un UUID v4 valide : sans ce test, un
  // onglet passe par ?proof-diagnostic=1 avant ?film=1 garderait ce sid partage
  // et deux prises seraient attribuees au meme visiteur.
  var __pinned="435b8f99-e523-4b27-95ff-ead084fb2333";
  if(__filmParam==="new"||!__sid||__sid===__pinned||!__uuidRe.test(__sid)){
    // Les DEUX cles ensemble : session.ts ne reutilise un sid persiste que si
    // korvus_sid ET korvus_sid_created_at sont valides, sinon il regenere les
    // deux et le tirage pre-echantillonne est perdu en silence.
    __ssSet("korvus_sid",__sampledUuid());
    __ssSet("korvus_sid_created_at",new Date().toISOString());
  }
}

var __proofDiagnostic=__sp.get("proof-diagnostic")==="1"||__film;
if(__proofDiagnostic){
  window.Cookiebot={consent:{statistics:true}};
  // Epinglage historique du sid : seulement si rien n'est deja pose. Le mode
  // film a la priorite, et deux tournages ne partagent plus jamais un sid.
  if(!__ssGet("korvus_sid")){
    __ssSet("korvus_sid","435b8f99-e523-4b27-95ff-ead084fb2333");
  }
  if(!__ssGet("korvus_sid_created_at")){
    __ssSet("korvus_sid_created_at",new Date().toISOString());
  }
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
    proofChunkUrl:"https://demo.korvus.fr/korvus-proof.min.js",
    // Sans politique de masquage, le chunk part en repli STRICT : texte masque,
    // medias bloques. La video est alors un mur d'asterisques, y compris sur le
    // message d'erreur -- c'est-a-dire sur la seule chose qu'elle doit prouver.
    // Le loader derive l'URL du proofChunkUrl ci-dessus, donc le fichier doit
    // etre servi par CE domaine : public/proof-policy/<id>.js.
    proofPolicyId:"f2c220321a992bef70b65931"
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
            <DemoBugProvider>
              <Suspense fallback={null}>
                <GTMPageView />
              </Suspense>
              <Header />
              <main className="flex-1">{children}</main>
              <Footer />
              <CookieBanner />
            </DemoBugProvider>
          </CartProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
