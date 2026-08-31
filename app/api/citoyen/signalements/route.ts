import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateUpload } from "@/lib/uploadSecurity";
import { creerSignalement, ajouterPieceJointe } from "@/lib/signalements";
import { isSignalementMotifCitoyen } from "@/lib/signalementsConstants";

// Signalements — Lot 1 (case management, 08/08/2026). Remplace l'accès
// direct anon-client de app/signalement/page.tsx (aucune policy RLS
// n'existe sur `signalements` — voir CLAUDE.md /signalements-lot1).
// Authentification par vrai accessToken Supabase Auth (comme
// app/api/citoyen/documents/upload/route.ts) au lieu d'un citoyen_id lu
// depuis localStorage sans vérification.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const MAX_PREUVE_SIZE = 5 * 1024 * 1024;

export async function GET(request: NextRequest) {
  const accessToken = request.nextUrl.searchParams.get("accessToken");
  if (!accessToken) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data: { user }, error: authErr } = await sb.auth.getUser(accessToken);
  if (authErr || !user) return NextResponse.json({ error: "Session invalide ou expirée" }, { status: 401 });

  const { data, error } = await sb.from("signalements")
    .select("id, numero_public, motif, description, preuve_url, statut, created_at, institution_id")
    .eq("citoyen_id", user.id).eq("type_signaleur", "citoyen")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const institutionIds = [...new Set((data ?? []).map(s => s.institution_id).filter(Boolean))];
  const instMap = new Map<string, { name: string; logo: string | null }>();
  if (institutionIds.length > 0) {
    const { data: institutions } = await sb.from("institutions").select("id, name, logo").in("id", institutionIds);
    (institutions ?? []).forEach(i => instMap.set(i.id, { name: i.name, logo: i.logo }));
  }

  const signalements = (data ?? []).map(s => ({
    ...s,
    institution_name: instMap.get(s.institution_id)?.name || "Institution",
    institution_logo: instMap.get(s.institution_id)?.logo || null,
  }));

  return NextResponse.json({ signalements });
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  const accessToken = form.get("accessToken");
  const institutionId = form.get("institution_id");
  const motif = form.get("motif");
  const description = form.get("description");
  const rdvId = form.get("rdv_id");
  const file = form.get("file");

  if (typeof accessToken !== "string" || !accessToken) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { data: { user }, error: authErr } = await sb.auth.getUser(accessToken);
  if (authErr || !user) return NextResponse.json({ error: "Session invalide ou expirée" }, { status: 401 });

  if (typeof institutionId !== "string" || !institutionId) return NextResponse.json({ error: "Sélectionnez une institution." }, { status: 400 });
  if (typeof rdvId !== "string" || !rdvId) return NextResponse.json({ error: "Sélectionnez le rendez-vous concerné." }, { status: 400 });
  if (typeof motif !== "string" || !isSignalementMotifCitoyen(motif)) {
    return NextResponse.json({ error: "Motif de signalement invalide." }, { status: 400 });
  }
  if (typeof description !== "string" || description.trim().length < 20) {
    return NextResponse.json({ error: "Décrivez le problème en au moins 20 caractères." }, { status: 400 });
  }

  // Le RDV doit appartenir au couple citoyen/institution — empêche de
  // rattacher un signalement au rendez-vous de quelqu'un d'autre.
  const { data: rdvRow } = await sb.from("rdv").select("id").eq("id", rdvId).eq("citoyen_id", user.id).eq("institution_id", institutionId).maybeSingle();
  if (!rdvRow) return NextResponse.json({ error: "Ce rendez-vous ne correspond pas à votre compte." }, { status: 400 });

  const { data: prenomRow } = await sb.from("users").select("prenom").eq("id", user.id).maybeSingle();

  const resultat = await creerSignalement({
    institutionId,
    typeSignaleur: "citoyen",
    typeCible: "institution",
    citoyenId: user.id,
    motif,
    description: description.trim(),
    rdvId,
    acteur: { type: "citoyen", id: user.id, nom: prenomRow?.prenom || "Citoyen" },
    req: request,
  });
  if (!resultat.ok) return NextResponse.json({ error: resultat.error }, { status: 500 });

  if (file instanceof File) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const verif = await validateUpload(buffer, "SIGNALEMENT_PREUVE", MAX_PREUVE_SIZE, file.name);
    if (verif.valid) {
      const path = `${institutionId}/${resultat.id}/${crypto.randomUUID()}.${verif.extension}`;
      const { error: upErr } = await sb.storage.from("signalements-preuves").upload(path, buffer, { contentType: verif.detectedType });
      if (!upErr) {
        await ajouterPieceJointe({
          signalementId: resultat.id, institutionId, storagePath: path, nomOriginal: file.name,
          typeMime: verif.detectedType, taille: file.size,
          auteur: { membreId: null, nom: prenomRow?.prenom || "Citoyen" }, req: request,
        });
      }
    }
    // Fichier invalide ou upload échoué : le signalement reste créé sans
    // preuve, jamais bloquant (la preuve est optionnelle côté citoyen).
  }

  await sb.from("notifications").insert({
    destinataire_id: institutionId,
    destinataire_type: "institution",
    rdv_id: typeof rdvId === "string" && rdvId ? rdvId : null,
    type: "signalement",
    titre: "Nouveau signalement reçu",
    message: `Un citoyen a signalé votre institution pour : ${motif}`,
  });

  return NextResponse.json({ success: true, id: resultat.id, numeroPublic: resultat.numeroPublic });
}
