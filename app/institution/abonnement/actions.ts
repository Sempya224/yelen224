"use server";

import { supabase } from "@/lib/supabase";
import { redirect } from "next/navigation";

export async function submitWireTransferPayment(formData: FormData) {
  const reference = String(formData.get("reference") ?? "").trim();
  if (!reference) {
    redirect("/institution/abonnement?error=reference");
  }

  const { error } = await supabase.from("paiements").insert({
    statut: "en_attente",
    methode: "virement_afrique",
    reference,
  });

  if (error) {
    console.error("[abonnement] insert paiement:", error.message);
    redirect("/institution/abonnement?error=supabase");
  }

  redirect("/institution/abonnement?success=1");
}
