import type { Metadata } from "next";
import { getAllProducts } from "@/lib/products";
import { SearchView } from "@/components/SearchView";

export const metadata: Metadata = {
  title: "Recherche",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  return <SearchView query={q.trim()} products={getAllProducts()} />;
}
