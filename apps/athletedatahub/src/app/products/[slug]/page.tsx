import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProductBySlug, getAllProducts, getRelatedProducts } from "@/lib/products";
import { ProductView } from "@/components/ProductView";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllProducts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) return { title: "Product Not Found" };
  return {
    title: process.env.NEXT_PUBLIC_LOCALE === "FR" ? product.nameFr : product.name,
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = getProductBySlug(slug);

  if (!product) notFound();

  const related = getRelatedProducts(product, 4);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.nameFr,
    sku: product.id,
    description: product.descriptionFr,
    image: product.image,
    offers: {
      "@type": "Offer",
      price: product.priceFr,
      priceCurrency: "EUR",
      availability: product.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductView product={product} related={related} />
    </>
  );
}
