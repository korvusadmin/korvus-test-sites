import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProductsByCategory, getAllCategories } from "@/lib/products";
import type { Category } from "@/types";
import { CategoryView } from "@/components/CategoryView";

interface PageProps {
  params: Promise<{ category: string }>;
}

export async function generateStaticParams() {
  return getAllCategories().map((category) => ({ category }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category } = await params;
  const categoryLabels: Record<string, string> = {
    running: "Running",
    trail: "Trail",
    triathlon: "Triathlon",
    cycling: "Cycling",
    equipment: "Equipment",
    nutrition: "Nutrition",
  };
  return { title: categoryLabels[category] ?? "Category" };
}

export default async function CategoryPage({ params }: PageProps) {
  const { category } = await params;

  if (!["running", "trail", "triathlon", "cycling", "equipment", "nutrition"].includes(category)) {
    notFound();
  }

  const validCategory = category as Category;
  const products = getProductsByCategory(validCategory);
  return <CategoryView category={validCategory} products={products} />;
}
