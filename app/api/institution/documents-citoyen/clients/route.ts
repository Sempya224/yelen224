import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";

// Sélecteur client+RDV pour l'écran "Documents clients" — volontairement
// séparé de /api/institution/clients (gated "mes-clients", inaccessible au
// comptable depuis la décision CEO du 22/07/2026) : ce lot doit rester
// autonome, gated uniquement sur "documents-clients".
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "documents-clients") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const { data: rdvRaw, error: rdvErr } = await sb
    .from("rdv")
    .select("id,citoyen_id,date_rdv,heure_rdv,objet,statut")
    .eq("institution_id", membre.institutionId)
    .order("date_rdv", { ascending: false });
  if (rdvErr) return NextResponse.json({ error: rdvErr.message }, { status: 500 });
  if (!rdvRaw?.length) return NextResponse.json({ clients: [] });

  const citoyenIds = [...new Set(rdvRaw.map((r) => r.citoyen_id).filter(Boolean))];
  const { data: usersD } = await sb.from("users").select("id,nom,prenom,phone").in("id", citoyenIds);
  const uMap = new Map((usersD ?? []).map((u) => [u.id, u]));

  const clientMap = new Map<string, { id: string; nom: string; phone: string; rdv: { id: string; date_rdv: string; heure_rdv: string; objet: string | null; statut: string }[] }>();
  for (const r of rdvRaw) {
    if (!r.citoyen_id) continue;
    let c = clientMap.get(r.citoyen_id);
    if (!c) {
      const u = uMap.get(r.citoyen_id);
      const nom = u ? [u.prenom, u.nom].filter(Boolean).join(" ") || u.phone : "Citoyen";
      c = { id: r.citoyen_id, nom, phone: u?.phone ?? "", rdv: [] };
      clientMap.set(r.citoyen_id, c);
    }
    c.rdv.push({ id: r.id, date_rdv: r.date_rdv, heure_rdv: r.heure_rdv, objet: r.objet, statut: r.statut });
  }

  return NextResponse.json({ clients: [...clientMap.values()] });
}
