import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can, canAccessTab } from "@/lib/institutionPermissions";
import { validateUpload } from "@/lib/uploadSecurity";
import { creerSignalement, ajouterPieceJointe } from "@/lib/signalements";
import { isSignalementMotifInstitution } from "@/lib/signalementsConstants";

// Signalements — Lot 1 (case management, 08/08/2026). Remplace l'accès
// direct anon-client de SignalementsTab.tsx.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const MAX_PREUVE_SIZE = 10 * 1024 * 1024;
const MAX_PIECES_JOINTES = 5;

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "signalements") === "none") {
    return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
  }

  // Élargi (15/08/2026, chantier arbitrage Yelen) : inclut désormais aussi
  // les dossiers déposés PAR un citoyen CONTRE cette institution
  // (type_signaleur=citoyen), auparavant invisibles ici — l'institution
  // n'avait qu'une notification de création, aucun endroit pour suivre le
  // dossier. Lecture + annotation seulement (assigner/notes/pièces
  // jointes) ; la décision reste exclusivement Yelen quel que soit le sens.
  const { data, error } = await sb.from("signalements")
    .select("id, numero_public, motif, description, preuve_url, statut, priorite, escalade_niveau, assigne_a_membre_id, created_at, citoyen_id, type_signaleur")
    .eq("institution_id", membre.institutionId).in("type_signaleur", ["institution", "citoyen"])
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const citoyenIds = [...new Set((data ?? []).map(s => s.citoyen_id).filter(Boolean))];
  const citoyenMap = new Map<string, { nom: string; phone: string | null }>();
  if (citoyenIds.length > 0) {
    const { data: users } = await sb.from("users").select("id, nom, prenom, phone").in("id", citoyenIds);
    (users ?? []).forEach(u => citoyenMap.set(u.id, { nom: [u.prenom, u.nom].filter(Boolean).join(" ") || u.phone || "Citoyen", phone: u.phone }));
  }

  const signalements = (data ?? []).map(s => ({
    ...s,
    citoyen_name: citoyenMap.get(s.citoyen_id)?.nom || "Citoyen",
    citoyen_phone: citoyenMap.get(s.citoyen_id)?.phone || null,
  }));

  return NextResponse.json({ signalements });
}

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "signalements.write")) {
    return NextResponse.json({ error: "Accès réservé aux rôles autorisés à créer un signalement" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  const citoyenId = form.get("citoyen_id");
  const rdvIdRaw = form.get("rdv_id");
  const rdvId = typeof rdvIdRaw === "string" && rdvIdRaw.trim() ? rdvIdRaw.trim() : null;
  const motif = form.get("motif");
  const description = form.get("description");
  const incidentDateRaw = form.get("incident_date");
  const incidentHeureRaw = form.get("incident_heure");
  const files = form.getAll("files").filter((f): f is File => f instanceof File);

  if (typeof citoyenId !== "string" || !citoyenId) return NextResponse.json({ error: "Sélectionnez un citoyen." }, { status: 400 });
  if (typeof motif !== "string" || !isSignalementMotifInstitution(motif)) {
    return NextResponse.json({ error: "Motif de signalement invalide." }, { status: 400 });
  }
  if (typeof description !== "string" || description.trim().length < 20) {
    return NextResponse.json({ error: "Décrivez le problème en au moins 20 caractères." }, { status: 400 });
  }
  if (description.trim().length > 1000) return NextResponse.json({ error: "Description limitée à 1000 caractères." }, { status: 400 });
  if (typeof incidentDateRaw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(incidentDateRaw)) {
    return NextResponse.json({ error: "Indiquez la date de l'incident." }, { status: 400 });
  }
  const incidentDate = incidentDateRaw;
  const incidentHeure = typeof incidentHeureRaw === "string" && /^\d{2}:\d{2}$/.test(incidentHeureRaw) ? incidentHeureRaw : null;
  if (files.length > MAX_PIECES_JOINTES) {
    return NextResponse.json({ error: `Maximum ${MAX_PIECES_JOINTES} pièces jointes.` }, { status: 400 });
  }

  // Le RDV doit appartenir au couple citoyen/institution — empêche de
  // rattacher un signalement au rendez-vous d'un autre citoyen. Désormais
  // facultatif ("Aucun rendez-vous spécifique", brief 16/09/2026) : un
  // signalement documente un fait daté (incident_date), pas forcément un
  // RDV précis.
  if (rdvId) {
    const { data: rdvRow } = await sb.from("rdv").select("id").eq("id", rdvId).eq("citoyen_id", citoyenId).eq("institution_id", membre.institutionId).maybeSingle();
    if (!rdvRow) return NextResponse.json({ error: "Ce rendez-vous ne correspond pas à ce citoyen." }, { status: 400 });
  }

  const { data: membreRow } = await sb.from("institution_membres").select("prenom, nom").eq("id", membre.membreId).maybeSingle();
  const membreNom = membreRow ? `${membreRow.prenom} ${membreRow.nom}` : "Membre";

  const resultat = await creerSignalement({
    institutionId: membre.institutionId,
    typeSignaleur: "institution",
    typeCible: "citoyen",
    citoyenId,
    motif,
    description: description.trim(),
    rdvId,
    incidentDate,
    incidentHeure,
    acteur: { type: "membre", id: membre.membreId, nom: membreNom },
    req,
  });
  if (!resultat.ok) return NextResponse.json({ error: resultat.error }, { status: 500 });

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const verif = await validateUpload(buffer, "SIGNALEMENT_PREUVE", MAX_PREUVE_SIZE, file.name);
    if (!verif.valid) continue;
    const path = `${membre.institutionId}/${resultat.id}/${crypto.randomUUID()}.${verif.extension}`;
    const { error: upErr } = await sb.storage.from("signalements-preuves").upload(path, buffer, { contentType: verif.detectedType });
    if (!upErr) {
      await ajouterPieceJointe({
        signalementId: resultat.id, institutionId: membre.institutionId, storagePath: path,
        nomOriginal: file.name, typeMime: verif.detectedType, taille: file.size,
        auteur: { membreId: membre.membreId, nom: membreNom }, req,
      });
    }
  }

  await sb.from("notifications").insert({
    destinataire_id: citoyenId,
    destinataire_type: "citoyen",
    type: "signalement",
    titre: "Signalement vous concernant",
    message: `Une institution a déposé un signalement vous concernant. Motif : ${motif}`,
  });

  return NextResponse.json({ success: true, id: resultat.id, numeroPublic: resultat.numeroPublic });
}
