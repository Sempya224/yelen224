import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can, canAccessTab } from "@/lib/institutionPermissions";

// Contourne RLS via service role — paid_services n'a qu'une policy SELECT
// anon limitée à is_active=true (migration 20260709000013, pensée pour la
// fiche publique) et paid_bookings n'a aucune policy du tout (volontairement
// verrouillée en attendant cette route, voir commentaire dans cette même
// migration). Le insert/update/delete client direct depuis ServicesTab.tsx
// échouait avec "new row violates row-level security policy", et la lecture
// (services suspendus, réservations, noms clients via `users`) était filtrée
// en silence par RLS sans erreur visible. Institution ciblée dérivée du
// cookie de session JWT, jamais d'un id fourni par le client.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "services") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const { data: services, error: svcErr } = await sb
    .from("paid_services").select("*").eq("institution_id", authInstId).order("created_at", { ascending: false });
  if (svcErr) return NextResponse.json({ error: svcErr.message }, { status: 500 });

  const sids = (services ?? []).map((s) => s.id);
  let bookings: Record<string, unknown>[] = [];
  if (sids.length > 0) {
    const { data: bkRaw, error: bkErr } = await sb
      .from("paid_bookings").select("*").in("service_id", sids).order("created_at", { ascending: false });
    if (bkErr) return NextResponse.json({ error: bkErr.message }, { status: 500 });

    const cids = [...new Set((bkRaw ?? []).map((b) => b.citoyen_id))];
    const uMap: Record<string, { nom: string; phone: string }> = {};
    if (cids.length > 0) {
      const { data: usersData } = await sb.from("users").select("id, nom, prenom, phone").in("id", cids);
      (usersData ?? []).forEach((u) => {
        const parts = [u.prenom, u.nom].filter(Boolean).join(" ");
        uMap[u.id] = { nom: parts || u.phone || "Citoyen", phone: u.phone || "" };
      });
    }
    bookings = (bkRaw ?? []).map((b) => ({ ...b, citoyen_nom: uMap[b.citoyen_id]?.nom ?? "Citoyen", citoyen_phone: uMap[b.citoyen_id]?.phone ?? "" }));
  }

  return NextResponse.json({ services: services ?? [], bookings });
}

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "services.write")) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  const authInstId = membre.institutionId;

  const body = await req.json().catch(() => null);
  const nom = body?.nom;
  const prix = body?.prix;
  const duree_minutes = body?.duree_minutes;

  if (typeof nom !== "string" || !nom.trim()) return NextResponse.json({ error: "Le nom est obligatoire" }, { status: 400 });
  if (typeof prix !== "number" || !(prix > 0)) return NextResponse.json({ error: "Prix invalide" }, { status: 400 });
  if (typeof duree_minutes !== "number" || !(duree_minutes > 0)) return NextResponse.json({ error: "Durée invalide" }, { status: 400 });

  const { data, error } = await sb.from("paid_services").insert({
    institution_id: authInstId,
    nom: nom.trim(),
    prix,
    duree_minutes,
    description: typeof body?.description === "string" && body.description.trim() ? body.description.trim() : null,
    categorie: typeof body?.categorie === "string" && body.categorie.trim() ? body.categorie.trim() : null,
    champs_complementaires: Array.isArray(body?.champs_complementaires) ? body.champs_complementaires : [],
    is_active: typeof body?.is_active === "boolean" ? body.is_active : true,
    taux_taxe: typeof body?.taux_taxe === "number" && body.taux_taxe >= 0 ? body.taux_taxe : 0,
    prix_promo: typeof body?.prix_promo === "number" && body.prix_promo > 0 ? body.prix_promo : null,
    promo_actif: typeof body?.promo_actif === "boolean" ? body.promo_actif : false,
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, service: data });
}

export async function PATCH(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "services.write")) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  const authInstId = membre.institutionId;

  const body = await req.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== "string") return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { data: cible } = await sb.from("paid_services").select("id,institution_id").eq("id", id).maybeSingle();
  if (!cible || cible.institution_id !== authInstId) return NextResponse.json({ error: "Service introuvable pour cette institution" }, { status: 404 });

  const updates: Record<string, unknown> = {};
  if (typeof body?.nom === "string" && body.nom.trim()) updates.nom = body.nom.trim();
  if (typeof body?.prix === "number" && body.prix > 0) updates.prix = body.prix;
  if (typeof body?.duree_minutes === "number" && body.duree_minutes > 0) updates.duree_minutes = body.duree_minutes;
  if (typeof body?.description === "string") updates.description = body.description.trim() || null;
  if (typeof body?.categorie === "string" || body?.categorie === null) updates.categorie = body?.categorie || null;
  if (Array.isArray(body?.champs_complementaires)) updates.champs_complementaires = body.champs_complementaires;
  if (typeof body?.is_active === "boolean") updates.is_active = body.is_active;
  if (typeof body?.taux_taxe === "number" && body.taux_taxe >= 0) updates.taux_taxe = body.taux_taxe;
  if (typeof body?.prix_promo === "number" || body?.prix_promo === null) updates.prix_promo = body?.prix_promo ?? null;
  if (typeof body?.promo_actif === "boolean") updates.promo_actif = body.promo_actif;

  const { data, error } = await sb.from("paid_services").update(updates).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, service: data });
}

export async function DELETE(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "services.write")) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  const authInstId = membre.institutionId;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { data: cible } = await sb.from("paid_services").select("id,institution_id").eq("id", id).maybeSingle();
  if (!cible || cible.institution_id !== authInstId) return NextResponse.json({ error: "Service introuvable pour cette institution" }, { status: 404 });

  const { error } = await sb.from("paid_services").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
