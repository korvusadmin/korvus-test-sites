import productsData from "../../data/products.json";
import type { Product, Category } from "@/types";

const products = productsData as Product[];

export function getAllProducts(): Product[] {
  return products;
}

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

export function getProductsByCategory(category: Category): Product[] {
  return products.filter((p) => p.category === category);
}

export function getFeaturedProducts(count = 8): Product[] {
  return [...products]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, count);
}

export function getRelatedProducts(
  product: Product,
  count = 4
): Product[] {
  return products
    .filter(
      (p) => p.category === product.category && p.id !== product.id
    )
    .sort((a, b) => b.rating - a.rating)
    .slice(0, count);
}

export function getAllCategories(): Category[] {
  return ["running", "trail", "triathlon", "cycling", "equipment", "nutrition"];
}
