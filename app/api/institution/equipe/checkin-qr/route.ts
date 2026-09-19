import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { genererTokenAgentQr } from "@/lib/checkinAuth";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";
import { APP_URL } from "@/lib/config";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Génération/révocation du badge QR Agent (YELEN Accueil) — même palier
// que la gestion d'équipe classique (equipe.write, admin uniquement).
// Le token en clair n'est renvoyé qu'une seule fois, à la génération —
// seul son hash SHA-256 est conservé en base (institution_membres.
// checkin_qr_hash), jamais rétro-consultable.
export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "equipe.write")) return NextResponse.json({ error: "Action non autorisée" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const membreId = body?.membreId;
  if (typeof membreId !== "string" || !membreId) return NextResponse.json({ error: "membreId requis" }, { status: 400 });

  const { data: cible } = await sb.from("institution_membres").select("id,institution_id,prenom,nom").eq("id", membreId).maybeSingle();
  if (!cible || cible.institution_id !== membre.institutionId) return NextResponse.json({ error: "Membre introuvable" }, { status: 404 });

  const { data: institution } = await sb.from("institutions").select("slug").eq("id", membre.institutionId).maybeSingle();
  if (!institution?.slug) return NextResponse.json({ error: "Établissement sans slug configuré — contactez le support Yelen." }, { status: 500 });

  const { token, hash } = genererTokenAgentQr();
  const { error } = await sb
    .from("institution_membres")
    .update({ checkin_qr_hash: hash, checkin_qr_generated_at: new Date().toISOString(), checkin_qr_revoked_at: null, checkin_qr_revoked_reason: null })
    .eq("id", membreId);
  if (error) return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "checkin_qr_genere",
    cibleTable: "institution_membres",
    cibleId: membreId,
    req,
  });

  // Contenu à encoder dans le QR imprimé — une vraie URL https (pas un
  // schéma personnalisé type yelen://) : trouvaille terrain 13/09/2026,
  // l'appareil photo natif d'un téléphone (le réflexe naturel de tout
  // agent, avant même d'ouvrir /check-in/{slug}) refuse d'ouvrir un schéma
  // inconnu ("No usable data found" sur iOS). Une URL https est reconnue
  // partout et ouvre directement /check-in/{slug} avec le badge en query
  // param, consommé automatiquement au chargement (voir CheckInApp.tsx).
  return NextResponse.json({ success: true, payload: `${APP_URL}/check-in/${institution.slug}?badge=${token}` });
}

export async function DELETE(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "equipe.write")) return NextResponse.json({ error: "Action non autorisée" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const membreId = body?.membreId;
  if (typeof membreId !== "string" || !membreId) return NextResponse.json({ error: "membreId requis" }, { status: 400 });

  const { data: cible } = await sb.from("institution_membres").select("id,institution_id").eq("id", membreId).maybeSingle();
  if (!cible || cible.institution_id !== membre.institutionId) return NextResponse.json({ error: "Membre introuvable" }, { status: 404 });

  const { error } = await sb
    .from("institution_membres")
    .update({ checkin_qr_revoked_at: new Date().toISOString(), checkin_qr_revoked_reason: "revocation_admin" })
    .eq("id", membreId);
  if (error) return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "checkin_qr_revoque",
    cibleTable: "institution_membres",
    cibleId: membreId,
    req,
  });

  return NextResponse.json({ success: true });
}
