import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";

// Barre KPI du Journal d'activité (Lot B, 23/07/2026) — même garde d'accès
// que /api/institution/journal (journal.read : admin/superviseur/dirigeant).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "journal.read")) return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });

  const instId = membre.institutionId;
  const debutAujourdhui = new Date();
  debutAujourdhui.setUTCHours(0, 0, 0, 0);
  const debutSemaine = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    { count: actionsAujourdhui },
    { count: actionsSemaine },
    { count: membresActifs },
    { count: connexions },
    { count: alertesSecurite },
    { count: actionsCritiques },
    { count: exportations },
    { data: derniereLigne },
  ] = await Promise.all([
    sb.from("journal_activite").select("id", { count: "exact", head: true })
      .eq("institution_id", instId).gte("created_at", debutAujourdhui.toISOString()),
    sb.from("journal_activite").select("id", { count: "exact", head: true })
      .eq("institution_id", instId).gte("created_at", debutSemaine.toISOString()),
    sb.from("institution_membres").select("id", { count: "exact", head: true })
      .eq("institution_id", instId).eq("actif", true),
    sb.from("journal_activite").select("id", { count: "exact", head: true })
      .eq("institution_id", instId).eq("action", "connexion").gte("created_at", debutAujourdhui.toISOString()),
    sb.from("journal_activite").select("id", { count: "exact", head: true })
      .eq("institution_id", instId).in("niveau", ["erreur", "critique"]).gte("created_at", debutSemaine.toISOString()),
    sb.from("journal_activite").select("id", { count: "exact", head: true })
      .eq("institution_id", instId).eq("niveau", "critique").gte("created_at", debutAujourdhui.toISOString()),
    sb.from("journal_activite").select("id", { count: "exact", head: true })
      .eq("institution_id", instId).eq("action", "export_journal").gte("created_at", debutSemaine.toISOString()),
    sb.from("journal_activite").select("created_at")
      .eq("institution_id", instId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return NextResponse.json({
    actions_aujourdhui: actionsAujourdhui ?? 0,
    actions_semaine: actionsSemaine ?? 0,
    membres_actifs: membresActifs ?? 0,
    connexions: connexions ?? 0,
    alertes_securite: alertesSecurite ?? 0,
    actions_critiques: actionsCritiques ?? 0,
    // Comptage réel (Lot G, export enrichi) — exports des 7 derniers jours,
    // même fenêtre que alertes_securite. La route /api/institution/journal/
    // export journalise chaque export sous action="export_journal".
    exportations: exportations ?? 0,
    derniere_synchronisation: derniereLigne?.created_at ?? null,
  });
}
