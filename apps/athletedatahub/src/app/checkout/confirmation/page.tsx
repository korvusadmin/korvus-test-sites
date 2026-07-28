import type { Metadata } from "next";
import { ConfirmationView } from "@/components/ConfirmationView";

export const metadata: Metadata = {
  title: "Commande confirmée",
};

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;
  return <ConfirmationView order={order} />;
}
