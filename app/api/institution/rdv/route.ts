import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";

// Contourne RLS via service role — rdv n'a aucune policy (confirmé par
// Bryan via SQL Editor le 16/07/2026 : pg_policies vide pour rdv, alors que
// RLS est activé) et les policies citoyen historiques (auth.uid()=citoyen_id,
// documentées le 07/07/2026) n'auraient de toute façon jamais couvert une
// lecture institution : les institutions n'ont pas de session Supabase Auth
// (JWT custom, voir lib/institutionAuth.ts), auth.uid() y est toujours null.
// page.tsx faisait un supabase.from("rdv")/("avis")/("users") direct côté
// navigateur (client anon) qui renvoyait silencieusement 0 ligne — même
// classe de bug déjà corrigée pour disponibilites/documents_travail/
// membres/paid_services. Institution ciblée dérivée du cookie de session
// JWT, jamais d'un id fourni par le client.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function buildNom(u: { nom: string | null; prenom: string | null; phone: string | null } | null): string {
  if (!u) return "Citoyen";
  const parts = [u.prenom, u.nom].filter(Boolean).join(" ");
  return parts || u.phone || "Citoyen";
}

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "rdv") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const { data: rdvRaw, error: rdvErr } = await sb
    .from("rdv")
    .select("id,objet,date_rdv,heure_rdv,statut,citoyen_id,pour_autre,nom_autre,phone_autre,presence,presence_status,presence_confirmed_at,conversation_terminee,motif_annulation,motif_report,created_at,termine_at,guichet,duree_minutes,description_besoin")
    .eq("institution_id", authInstId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (rdvErr) return NextResponse.json({ error: rdvErr.message }, { status: 500 });

  const rdvList = rdvRaw ?? [];
  const rdvCids = [...new Set(rdvList.map((r) => r.citoyen_id).filter(Boolean))];
  const uMap: Record<string, { nom: string; phone: string; photo: string | null }> = {};
  if (rdvCids.length > 0) {
    const { data: usersD } = await sb.from("users").select("id,nom,prenom,phone,photo_url").in("id", rdvCids);
    (usersD ?? []).forEach((u) => { uMap[u.id] = { nom: buildNom(u), phone: u.phone || "", photo: u.photo_url || null }; });
  }

  // Un RDV payant crée toujours une ligne rdv en plus de sa ligne
  // paid_bookings (voir app/rdv/[id]/page.tsx) — jusqu'ici invisible côté
  // institution, aucune mention "Payant" nulle part sur cet écran. On
  // rattache chaque rdv à sa réservation payante par créneau (date + heure).
  const { data: paidRaw } = await sb
    .from("paid_bookings")
    .select("id,date_rdv,heure_rdv,confirmation_code,paid_services(nom,prix)")
    .eq("institution_id", authInstId)
    .neq("statut", "annule");
  const paidMap = new Map<string, { id: string; nom: string; prix: number; code: string }>();
  type PaidRow = { id: string; date_rdv: string; heure_rdv: string; confirmation_code: string; paid_services: { nom: string; prix: number } | null };
  ((paidRaw ?? []) as unknown as PaidRow[]).forEach((b) => {
    if (!b.paid_services) return;
    paidMap.set(`${b.date_rdv}|${b.heure_rdv}`, { id: b.id, nom: b.paid_services.nom, prix: b.paid_services.prix, code: b.confirmation_code });
  });

  const rdvs = rdvList.map((r) => {
    const paid = paidMap.get(`${r.date_rdv}|${r.heure_rdv}`);
    return {
      ...r,
      citoyen_nom: uMap[r.citoyen_id]?.nom ?? "Citoyen", citoyen_phone: uMap[r.citoyen_id]?.phone ?? "",
      citoyen_photo: uMap[r.citoyen_id]?.photo ?? null,
      est_payant: !!paid, service_payant_nom: paid?.nom ?? null, service_payant_prix: paid?.prix ?? null,
      booking_payant_id: paid?.id ?? null,
    };
  });

  const { data: avisRaw } = await sb
    .from("avis")
    .select("id,note,commentaire,created_at,citoyen_id")
    .eq("institution_id", authInstId)
    .order("created_at", { ascending: false })
    .limit(50);

  let avis: Record<string, unknown>[] = [];
  if (avisRaw?.length) {
    const avisCids = [...new Set(avisRaw.map((a) => a.citoyen_id).filter(Boolean))];
    const uMap2: Record<string, string> = {};
    if (avisCids.length > 0) {
      const { data: usersD2 } = await sb.from("users").select("id,nom,prenom,phone").in("id", avisCids);
      (usersD2 ?? []).forEach((u) => { uMap2[u.id] = buildNom(u); });
    }
    const { data: rdvVerif } = await sb
      .from("rdv").select("citoyen_id")
      .eq("institution_id", authInstId)
      .in("statut", ["effectue", "termine", "confirme", "honore"]);
    const verifies = new Set((rdvVerif ?? []).map((r) => r.citoyen_id));

    avis = avisRaw.map((a) => ({
      ...a,
      citoyen_nom: uMap2[a.citoyen_id] ?? "Citoyen",
      rdv_confirmed: verifies.has(a.citoyen_id),
    }));
  }

  return NextResponse.json({ rdvs, avis });
}
