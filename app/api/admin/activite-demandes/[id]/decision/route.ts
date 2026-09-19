import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdmin, adminAuthErrorResponse } from "@/lib/adminAuth";

// Décision sur une demande "Autre activité" (valider = crée une nouvelle
// activité officielle / rattacher = lie à une activité existante /
// refuser) — écriture exclusivement via decider_demande_activite
// (migration 20260821000007), jamais un insert/update direct, même règle
// d'architecture que prendre_decision_verification.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await authorizeAdmin(req, "activites.manage");
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

    const {
      decision, note, statut_vu, activite_existante_id,
      nouvelle_categorie_id, nouvelle_code, nouveau_label, nouvelle_description, nouveaux_alias,
    } = body;

    const { data, error } = await sb.rpc("decider_demande_activite", {
      p_demande_id: id,
      p_decision: decision,
      p_note: note,
      p_examinateur_admin_id: admin.adminId,
      p_statut_vu: statut_vu ?? null,
      p_activite_existante_id: activite_existante_id ?? null,
      p_nouvelle_categorie_id: nouvelle_categorie_id ?? null,
      p_nouvelle_code: nouvelle_code ?? null,
      p_nouveau_label: nouveau_label ?? null,
      p_nouvelle_description: nouvelle_description ?? null,
      p_nouveaux_alias: Array.isArray(nouveaux_alias) ? nouveaux_alias : null,
    }).single() as { data: { id: string; decision_id: string } | null; error: { message: string } | null };

    if (error) {
      if (error.message.includes("a déjà été traitée entretemps")) {
        return NextResponse.json({ error: error.message, code: "CONFLIT_CONCURRENCE" }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!data) return NextResponse.json({ error: "Erreur inattendue" }, { status: 500 });

    await sb.from("admin_logs").insert({
      admin_id: admin.adminId,
      action: "DECISION_DEMANDE_ACTIVITE",
      cible_table: "activite_demande_decisions",
      cible_id: data.id,
      details: { demande_id: id, decision, decision_id: data.decision_id },
    });

    return NextResponse.json({ ok: true, decision: data });
  } catch (e) {
    return adminAuthErrorResponse(e);
  }
}
