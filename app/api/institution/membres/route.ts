import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { isMembreRole, can } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";

// Contourne RLS via service role — institution_membres n'a aucune policy
// publique (migration 20260714000001), accès exclusivement via cette
// route. Gestion d'équipe (POST/PATCH/DELETE) réservée au rôle admin ;
// lecture détaillée aussi ouverte à superviseur/dirigeant (lecture seule,
// cf. lib/institutionPermissions.ts "equipe.read_full").
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const PIN_REGEX = /^\d{6}$/;

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  // Superviseur/dirigeant voient la liste complète en lecture seule (onglet
  // Équipe), les autres rôles n'ont pas cet onglet mais ont quand même besoin
  // de connaître leurs collègues pour les sélecteurs "Assigné à" (tâches,
  // agenda) — liste allégée, sans identifiant/rôle/statut.
  if (!can(membre.role, "equipe.read_full")) {
    const { data, error } = await sb
      .from("institution_membres")
      .select("id,prenom,nom")
      .eq("institution_id", membre.institutionId)
      .eq("actif", true)
      .order("prenom", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ membres: data ?? [], role: membre.role, membreId: membre.membreId });
  }

  const { data, error } = await sb
    .from("institution_membres")
    .select("id,identifiant,prenom,nom,role,actif,compte_principal,doit_changer_pin,created_at")
    .eq("institution_id", membre.institutionId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ membres: data ?? [], role: membre.role, membreId: membre.membreId });
}

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "equipe.write")) {
    await enregistrerAction({
      institutionId: membre.institutionId, membreId: membre.membreId,
      membreNom: await getMembreNomPourJournal(membre.membreId),
      action: "membre_acces_refuse", cibleTable: "institution_membres",
      details: { role: membre.role, methode: "POST" },
      req,
    });
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const identifiant = body?.identifiant;
  const prenom = body?.prenom;
  const nom = body?.nom;
  const role = body?.role;
  const pin = body?.pin;

  if (typeof identifiant !== "string" || !identifiant.trim()) return NextResponse.json({ error: "Identifiant requis" }, { status: 400 });
  if (typeof prenom !== "string" || !prenom.trim()) return NextResponse.json({ error: "Prénom requis" }, { status: 400 });
  if (typeof nom !== "string" || !nom.trim()) return NextResponse.json({ error: "Nom requis" }, { status: 400 });
  if (!isMembreRole(role)) return NextResponse.json({ error: "Rôle invalide" }, { status: 400 });
  if (typeof pin !== "string" || !PIN_REGEX.test(pin)) return NextResponse.json({ error: "Le PIN doit contenir exactement 6 chiffres" }, { status: 400 });

  const { data: existant } = await sb.from("institution_membres").select("id").eq("identifiant", identifiant.trim()).maybeSingle();
  if (existant) return NextResponse.json({ error: "Cet identifiant est déjà utilisé" }, { status: 409 });

  const pinHash = await bcrypt.hash(pin, 10);
  const { data, error } = await sb
    .from("institution_membres")
    .insert({
      institution_id: membre.institutionId,
      identifiant: identifiant.trim(),
      pin_hash: pinHash,
      prenom: prenom.trim(),
      nom: nom.trim(),
      role,
      doit_changer_pin: true,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "membre_cree",
    cibleTable: "institution_membres",
    cibleId: data.id,
    details: { identifiant: identifiant.trim(), role },
    req,
  });

  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== "string") return NextResponse.json({ error: "id requis" }, { status: 400 });

  // Un membre peut changer son propre PIN (flux "doit_changer_pin") ; toute
  // autre modification (rôle, statut actif, PIN d'un tiers) est réservée à
  // l'admin.
  const isSelfPinChange = id === membre.membreId && body?.pin !== undefined && Object.keys(body).every(k => ["id", "pin"].includes(k));
  if (!isSelfPinChange && !can(membre.role, "equipe.write")) {
    await enregistrerAction({
      institutionId: membre.institutionId, membreId: membre.membreId,
      membreNom: await getMembreNomPourJournal(membre.membreId),
      action: "membre_acces_refuse", cibleTable: "institution_membres", cibleId: id,
      details: { role: membre.role, methode: "PATCH" },
      req,
    });
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const { data: cible } = await sb.from("institution_membres").select("id,institution_id,compte_principal").eq("id", id).maybeSingle();
  if (!cible || cible.institution_id !== membre.institutionId) {
    return NextResponse.json({ error: "Membre introuvable pour cette institution" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.pin === "string") {
    if (!PIN_REGEX.test(body.pin)) return NextResponse.json({ error: "Le PIN doit contenir exactement 6 chiffres" }, { status: 400 });
    updates.pin_hash = await bcrypt.hash(body.pin, 10);
    updates.doit_changer_pin = false;
  }
  if (can(membre.role, "equipe.write")) {
    if (typeof body?.prenom === "string" && body.prenom.trim()) updates.prenom = body.prenom.trim();
    if (typeof body?.nom === "string" && body.nom.trim()) updates.nom = body.nom.trim();
    if (isMembreRole(body?.role) && !cible.compte_principal) updates.role = body.role;
    if (typeof body?.actif === "boolean" && !cible.compte_principal) updates.actif = body.actif;
  }

  const { error } = await sb.from("institution_membres").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: isSelfPinChange ? "pin_change_personnel" : "membre_modifie",
    cibleTable: "institution_membres",
    cibleId: id,
    details: { champs: Object.keys(updates).filter(k => k !== "updated_at" && k !== "pin_hash") },
    req,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "equipe.write")) {
    await enregistrerAction({
      institutionId: membre.institutionId, membreId: membre.membreId,
      membreNom: await getMembreNomPourJournal(membre.membreId),
      action: "membre_acces_refuse", cibleTable: "institution_membres",
      details: { role: membre.role, methode: "DELETE" },
      req,
    });
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { data: cible } = await sb.from("institution_membres").select("id,institution_id,compte_principal").eq("id", id).maybeSingle();
  if (!cible || cible.institution_id !== membre.institutionId) {
    return NextResponse.json({ error: "Membre introuvable pour cette institution" }, { status: 404 });
  }
  if (cible.compte_principal) return NextResponse.json({ error: "Le compte administrateur principal ne peut pas être supprimé" }, { status: 400 });

  const { error } = await sb.from("institution_membres").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "membre_supprime",
    cibleTable: "institution_membres",
    cibleId: id,
    req,
  });

  return NextResponse.json({ ok: true });
}
