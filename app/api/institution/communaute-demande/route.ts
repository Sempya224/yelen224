import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";

// Demande d'adhésion à Yelen Community (23/08/2026) — mirroring exact de
// app/api/institution/partenariat/route.ts : GET renvoie le statut + la
// dernière demande, POST soumet une nouvelle demande. Gatée par
// communaute_pro.publish (même permission que la publication elle-même —
// c'est la même décision institutionnelle, juste la première étape).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data: inst, error: instErr } = await sb
    .from("institutions")
    .select("communaute_statut")
    .eq("id", membre.institutionId)
    .maybeSingle();
  if (instErr) return NextResponse.json({ error: instErr.message }, { status: 500 });

  const { data: demande } = await sb
    .from("institution_communaute_demandes")
    .select("id,statut,motif_refus,date_decision,created_at")
    .eq("institution_id", membre.institutionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { count: institutionsActives } = await sb
    .from("institutions")
    .select("id", { count: "exact", head: true })
    .eq("communaute_statut", "approuve");

  return NextResponse.json({
    communaute_statut: inst?.communaute_statut ?? "aucun",
    derniere_demande: demande ?? null,
    institutions_actives: institutionsActives ?? 0,
  });
}

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "communaute_pro.publish")) {
    return NextResponse.json({ error: "Action non autorisée pour votre rôle" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  if (typeof body.intention !== "string" || !body.intention.trim()) {
    return NextResponse.json({ error: 'Champ "intention" requis' }, { status: 400 });
  }
  if (body.conditions_acceptees !== true) {
    return NextResponse.json({ error: "Les règles de publication doivent être acceptées" }, { status: 400 });
  }

  const { data: inst, error: instErr } = await sb
    .from("institutions")
    .select("communaute_statut, name, email, phone")
    .eq("id", membre.institutionId)
    .maybeSingle();
  if (instErr) return NextResponse.json({ error: instErr.message }, { status: 500 });
  if (inst?.communaute_statut === "en_attente" || inst?.communaute_statut === "approuve") {
    return NextResponse.json({ error: "Une demande est déjà en attente ou déjà approuvée" }, { status: 409 });
  }

  // Contact rempli depuis le Profil Entreprise + le membre connecté — jamais
  // saisi par le client (retour Bryan 23/08/2026 : seule l'intention est à
  // saisir manuellement).
  const { data: membreRow } = await sb.from("institution_membres").select("prenom, nom").eq("id", membre.membreId).maybeSingle();
  const contactNom = [membreRow?.prenom, membreRow?.nom].filter(Boolean).join(" ").trim() || inst?.name || "Membre Yelen";

  const { data: demande, error } = await sb
    .from("institution_communaute_demandes")
    .insert({
      institution_id: membre.institutionId,
      intention: body.intention,
      contact_nom: contactNom,
      contact_email: inst?.email || "",
      contact_telephone: inst?.phone || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb.from("institutions").update({ communaute_statut: "en_attente" }).eq("id", membre.institutionId);

  return NextResponse.json({ demande });
}
