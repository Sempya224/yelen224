import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateUpload } from "@/lib/uploadSecurity";
import { creerSignalement, ajouterPieceJointe } from "@/lib/signalements";
import { isSignalementMotifCitoyen } from "@/lib/signalementsConstants";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";

// Signalements — Lot 1 (case management, 08/08/2026). Remplace l'accès
// direct anon-client de app/signalement/page.tsx (aucune policy RLS
// n'existe sur `signalements` — voir CLAUDE.md /signalements-lot1).
// Authentification par vrai accessToken Supabase Auth (comme
// app/api/citoyen/documents/upload/route.ts) au lieu d'un citoyen_id lu
// depuis localStorage sans vérification.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const MAX_PREUVE_SIZE = 5 * 1024 * 1024;

// Types d'événements sûrs à exposer au citoyen (V2 "Suivi", 11/09/2026) —
// jamais assigned/priority_changed/note_added/attachment_added/escalated,
// qui révèlent de l'organisation interne institution/Yelen (nom d'agent,
// priorité de traitement, notes internes). Tous les types retenus ici
// portent nouvelle_valeur.statut (voir lib/signalements.ts::changerStatutInterne),
// sauf "created" qui n'a pas de statut associé.
const EVENTS_CITOYEN_SAFE = ["created", "status_changed", "resolved", "closed", "reopened", "marked_duplicate"];

export async function GET(request: NextRequest) {
  const accessToken = request.nextUrl.searchParams.get("accessToken");
  const id = request.nextUrl.searchParams.get("id");
  if (!accessToken) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const user = await verifierCitoyenToken(accessToken);
  if (!user) return NextResponse.json({ error: "Session invalide ou expirée" }, { status: 401 });

  // Détail d'un signalement — institution/RDV concerné + timeline de suivi
  // (V2, 11/09/2026). Passe par ?id= sur cette même route plutôt qu'une
  // route [id] séparée pour rester à 1 seul fichier API modifié.
  if (id) {
    const { data: row, error: rowError } = await sb.from("signalements")
      .select("id, numero_public, motif, description, preuve_url, statut, created_at, institution_id, rdv_id, citoyen_id, type_signaleur")
      .eq("id", id).maybeSingle();
    if (rowError) return NextResponse.json({ error: rowError.message }, { status: 500 });
    if (!row || row.citoyen_id !== user.id || row.type_signaleur !== "citoyen") {
      return NextResponse.json({ error: "Signalement introuvable." }, { status: 404 });
    }

    const { data: inst } = await sb.from("institutions").select("name, logo").eq("id", row.institution_id).maybeSingle();

    let rdvInfo: { date_rdv: string; heure_rdv: string; objet: string | null } | null = null;
    if (row.rdv_id) {
      const { data: rdv } = await sb.from("rdv").select("date_rdv, heure_rdv, objet").eq("id", row.rdv_id).maybeSingle();
      rdvInfo = rdv ?? null;
    }

    const { data: events } = await sb.from("signalement_events")
      .select("type, nouvelle_valeur, created_at")
      .eq("signalement_id", id)
      .in("type", EVENTS_CITOYEN_SAFE)
      .order("created_at", { ascending: true });

    const suivi = (events ?? []).map(e => ({
      type: e.type as string,
      statut: (e.nouvelle_valeur as { statut?: string } | null)?.statut ?? null,
      created_at: e.created_at as string,
    }));

    return NextResponse.json({
      signalement: {
        ...row,
        institution_name: inst?.name || "Institution",
        institution_logo: inst?.logo || null,
        rdv_date: rdvInfo?.date_rdv || null,
        rdv_heure: rdvInfo?.heure_rdv || null,
        rdv_objet: rdvInfo?.objet || null,
      },
      suivi,
    });
  }

  const { data, error } = await sb.from("signalements")
    .select("id, numero_public, motif, description, preuve_url, statut, created_at, institution_id, rdv_id")
    .eq("citoyen_id", user.id).eq("type_signaleur", "citoyen")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const institutionIds = [...new Set((data ?? []).map(s => s.institution_id).filter(Boolean))];
  const instMap = new Map<string, { name: string; logo: string | null }>();
  if (institutionIds.length > 0) {
    const { data: institutions } = await sb.from("institutions").select("id, name, logo").in("id", institutionIds);
    (institutions ?? []).forEach(i => instMap.set(i.id, { name: i.name, logo: i.logo }));
  }

  // RDV concerné par signalement (V2 liste, 11/09/2026) — la description
  // sort de la carte, remplacée par la date/heure + objet du rendez-vous.
  const rdvIds = [...new Set((data ?? []).map(s => s.rdv_id).filter(Boolean))] as string[];
  const rdvMap = new Map<string, { date_rdv: string; heure_rdv: string; objet: string | null }>();
  if (rdvIds.length > 0) {
    const { data: rdvs } = await sb.from("rdv").select("id, date_rdv, heure_rdv, objet").in("id", rdvIds);
    (rdvs ?? []).forEach(r => rdvMap.set(r.id, { date_rdv: r.date_rdv, heure_rdv: r.heure_rdv, objet: r.objet }));
  }

  const signalements = (data ?? []).map(s => {
    const rdv = s.rdv_id ? rdvMap.get(s.rdv_id) : null;
    return {
      ...s,
      institution_name: instMap.get(s.institution_id)?.name || "Institution",
      institution_logo: instMap.get(s.institution_id)?.logo || null,
      rdv_date: rdv?.date_rdv || null,
      rdv_heure: rdv?.heure_rdv || null,
      rdv_objet: rdv?.objet || null,
    };
  });

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
  const user = await verifierCitoyenToken(accessToken);
  if (!user) return NextResponse.json({ error: "Session invalide ou expirée" }, { status: 401 });

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
