"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Truck, RotateCcw, Headphones, ShieldCheck } from "lucide-react";
import { getFeaturedProducts, getProductsByCategory } from "@/lib/products";
import { ProductCard } from "@/components/ProductCard";
import { useLocale } from "@/context/LocaleContext";

const categories = [
  {
    key: "running",
    title: "Running",
    subtitleFr: "Route · Piste · Marathon",
    subtitleEn: "Road · Track · Marathon",
    image: "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1200&q=85",
  },
  {
    key: "trail",
    title: "Trail",
    subtitleFr: "Montagne · Ultra · Outdoor",
    subtitleEn: "Mountain · Ultra · Outdoor",
    image: "https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=1200&q=85",
  },
  {
    key: "triathlon",
    title: "Triathlon",
    subtitleFr: "Natation · Vélo · Course",
    subtitleEn: "Swim · Bike · Run",
    image: "/images/triathlon-category.png",
  },
] as const;

export default function HomePage() {
  const { locale } = useLocale();
  const featuredProducts = getFeaturedProducts(8);
  const trailPicks = getProductsByCategory("trail").slice(0, 4);
  const fr = locale === "fr";

  return (
    <>
      <section
        className="relative min-h-[620px] flex items-center overflow-hidden bg-[#07111f]"
        style={{ position: "relative" }}
      >
        <Image src="/images/athletedatahub-hero.png" alt="" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07111f] via-[#07111f]/75 to-transparent" />
        <div className="relative max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-24">
          <div className="max-w-2xl text-white">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.24em] text-[#d8ff3e] mb-5">
              <span className="w-7 h-px bg-[#d8ff3e]" /> {fr ? "Saison 2026" : "Season 2026"}
            </p>
            <h1 className="text-5xl md:text-7xl font-black tracking-[-0.045em] leading-[0.96] mb-6">
              {fr ? "Allez plus loin." : "Go further."}
              <span className="block text-[#d8ff3e]">{fr ? "Équipez-vous juste." : "Gear up right."}</span>
            </h1>
            <p className="text-lg md:text-xl text-slate-200 max-w-xl leading-relaxed mb-9">
              {fr
                ? "Le meilleur du running, du trail et du triathlon, sélectionné et testé par des athlètes passionnés."
                : "The best running, trail and triathlon gear, selected and tested by passionate athletes."}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/catalog" className="inline-flex items-center gap-2 bg-[#d8ff3e] text-[#07111f] px-6 py-3.5 font-black hover:bg-white transition-colors">
                {fr ? "Découvrir le catalogue" : "Shop the collection"} <ArrowRight className="w-5 h-5" />
              </Link>
              <Link href="/catalog/trail" className="inline-flex items-center gap-2 border border-white/40 bg-white/10 text-white px-6 py-3.5 font-bold hover:bg-white/20">
                {fr ? "Sélection trail" : "Trail selection"}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 lg:grid-cols-4">
          {[
            [Truck, fr ? "Livraison offerte dès 75 €" : "Free shipping over €75"],
            [RotateCcw, fr ? "Retours sous 30 jours" : "30-day returns"],
            [Headphones, fr ? "Experts à votre écoute" : "Advice from athletes"],
            [ShieldCheck, fr ? "Paiement 100 % sécurisé" : "Secure payment"],
          ].map(([Icon, text]) => {
            const FeatureIcon = Icon as typeof Truck;
            return (
              <div key={String(text)} className="flex items-center gap-3 py-5 px-2 lg:px-5 border-r border-slate-100 last:border-r-0">
                <FeatureIcon className="w-5 h-5 text-[#719000] flex-shrink-0" />
                <span className="text-xs sm:text-sm font-semibold text-slate-700">{String(text)}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#719000] mb-2">{fr ? "Votre terrain, vos règles" : "Your field, your rules"}</p>
            <h2 className="text-3xl md:text-4xl font-black tracking-tight text-[#07111f]">{fr ? "Choisissez votre discipline" : "Choose your discipline"}</h2>
          </div>
          <Link href="/catalog" className="hidden sm:flex items-center gap-1 text-sm font-bold hover:underline">{fr ? "Tout voir" : "View all"} <ArrowRight className="w-4 h-4" /></Link>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {categories.map((category) => (
            <Link
              key={category.key}
              href={`/catalog/${category.key}`}
              className="group relative aspect-[4/5] overflow-hidden bg-slate-900"
              style={{ position: "relative", aspectRatio: "4 / 5" }}
            >
              <Image src={category.image} alt={category.title} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover group-hover:scale-105 transition-transform duration-700" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-7 text-white">
                <p className="text-xs uppercase tracking-[0.17em] text-[#d8ff3e] mb-2">{fr ? category.subtitleFr : category.subtitleEn}</p>
                <div className="flex items-center justify-between">
                  <h3 className="text-3xl font-black">{category.title}</h3>
                  <span className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center group-hover:bg-[#d8ff3e]"><ArrowRight className="w-5 h-5" /></span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-[#f3f4ef] py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#719000] mb-2">{fr ? "Plébiscités par la communauté" : "Community favourites"}</p>
              <h2 className="text-3xl md:text-4xl font-black text-[#07111f]">{fr ? "Les incontournables" : "Best sellers"}</h2>
            </div>
            <Link href="/catalog" className="flex items-center gap-1 text-sm font-bold hover:underline">{fr ? "Voir les 30 produits" : "View all 30 products"} <ArrowRight className="w-4 h-4" /></Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {featuredProducts.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="bg-[#07111f] text-white grid lg:grid-cols-[0.8fr_1.2fr] overflow-hidden">
          <div className="p-9 lg:p-14 flex flex-col justify-center">
            <p className="text-xs uppercase tracking-[0.2em] text-[#d8ff3e] font-bold mb-4">{fr ? "Guide expert" : "Expert guide"}</p>
            <h2 className="text-3xl md:text-4xl font-black leading-tight mb-4">{fr ? "Préparez votre premier ultra-trail" : "Prepare for your first ultra trail"}</h2>
            <p className="text-slate-300 mb-7 leading-relaxed">{fr ? "Chaussures, portage, éclairage, textile : notre sélection essentielle pour arriver serein sur la ligne de départ." : "Shoes, hydration, lighting and apparel: the essential kit for a confident start line."}</p>
            <Link href="/catalog/trail" className="inline-flex w-fit items-center gap-2 text-[#d8ff3e] font-bold">{fr ? "Voir la sélection" : "Explore the edit"} <ArrowRight className="w-4 h-4" /></Link>
          </div>
          <div className="grid grid-cols-2">
            {trailPicks.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        </div>
      </section>

      <section className="bg-[#d8ff3e] py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-3xl font-black text-[#07111f]">{fr ? "10 € offerts sur votre première commande" : "€10 off your first order"}</h2>
            <p className="text-slate-700 mt-1">{fr ? "Recevez aussi nos conseils entraînement et nos nouveautés." : "Plus training advice and new product alerts."}</p>
          </div>
          <form className="flex w-full md:w-auto min-w-0">
            <input type="email" aria-label="Email" placeholder="votre@email.fr" className="min-w-0 w-full md:w-72 bg-white px-4 py-3.5 outline-none" />
            <button className="bg-[#07111f] text-white px-5 py-3.5 font-bold">{fr ? "Je m’inscris" : "Sign me up"}</button>
          </form>
        </div>
      </section>
    </>
  );
}
