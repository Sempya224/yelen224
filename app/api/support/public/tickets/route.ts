import { NextRequest, NextResponse } from "next/server";
import { creerTicketPublic, compterDemandesPubliquesRecentes } from "@/lib/supportTickets";
import { isSupportCategoriePublic, isValidEmail } from "@/lib/supportTicketsConstants";

// Support Public Yelen (chantier "Yelen Support Public Général",
// 24/09/2026) — création de demande sans compte, aucune authentification.
// Design complet : docs/support-center/public-support-architecture.md et
// docs/support-center/public-support-technical-design.md §6.
//
// Rate limiting edge déjà appliqué automatiquement via
// lib/edgeSecurity.ts::ENDPOINTS_SENSIBLES (proxy.ts, matcher global) —
// le plafond par email ci-dessous est une couche applicative
// supplémentaire, pas un remplacement.
const MAX_DEMANDES_PAR_EMAIL_24H = 3;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  // Honeypot — jamais révéler à un bot qu'il a été détecté (200 factice,
  // aucune écriture). Repris du principe déjà appliqué sur /contact.
  if (typeof body?._hp === "string" && body._hp.trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  const nom = typeof body?.nom === "string" ? body.nom.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const telephone = typeof body?.telephone === "string" ? body.telephone.trim() : "";
  const categorie = body?.categorie;
  const sujet = typeof body?.sujet === "string" ? body.sujet.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  // Validation serveur complète — jamais confiance dans le payload client,
  // y compris la catégorie (vérifiée contre la liste CHECK réelle).
  if (!nom || nom.length > 120) {
    return NextResponse.json({ ok: false, error: "Nom requis (120 caractères maximum)." }, { status: 400 });
  }
  if (!email || email.length > 254 || !isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "Adresse email invalide." }, { status: 400 });
  }
  if (telephone && (telephone.length < 6 || telephone.length > 20)) {
    return NextResponse.json({ ok: false, error: "Numéro de téléphone invalide." }, { status: 400 });
  }
  if (typeof categorie !== "string" || !isSupportCategoriePublic(categorie)) {
    return NextResponse.json({ ok: false, error: "Catégorie invalide." }, { status: 400 });
  }
  if (!sujet || sujet.length > 200) {
    return NextResponse.json({ ok: false, error: "Sujet requis (200 caractères maximum)." }, { status: 400 });
  }
  if (!message || message.length > 4000) {
    return NextResponse.json({ ok: false, error: "Message requis (4000 caractères maximum)." }, { status: 400 });
  }

  const recentes = await compterDemandesPubliquesRecentes(email);
  if (recentes >= MAX_DEMANDES_PAR_EMAIL_24H) {
    return NextResponse.json({ ok: false, error: "Trop de demandes envoyées avec cette adresse récemment. Réessayez plus tard." }, { status: 429 });
  }

  const result = await creerTicketPublic({ nom, email, telephone: telephone || null, categorie, sujet, message, req: request });
  if (!result.ok) {
    // Jamais le détail interne de l'erreur au client (§6 technical design).
    return NextResponse.json({ ok: false, error: "Une erreur est survenue. Réessayez ou écrivez-nous directement." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, numeroPublic: result.numeroPublic }, { status: 201 });
}
