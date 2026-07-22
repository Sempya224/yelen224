import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { NOTE_POSITIVE_MIN, NOTE_NEGATIVE_MAX, extraireServiceDepuisObjet } from "@/lib/reputationScore";

// Route dédiée à la liste "Avis détaillés" — distincte de status/route.ts
// (agrégat unique) et de avis/repondre/route.ts (POST d'écriture, réutilisé
// tel quel par le client pour répondre). Mêmes raisons d'accès service_role
// que les autres routes avis-reputation/*.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Le filtre "service" n'est pas une colonne SQL (dérivé de rdv.objet) — on
// borne donc le résultat SQL avant de filtrer/paginer en mémoire. Même
// ordre de grandeur que journal/route.ts pour une seule institution.
const PLAFOND_SQL = 2000;
const LIMITE_DEFAUT = 20;
const LIMITE_MAX = 100;

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "avis-reputation") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const url = new URL(req.url);
  const type = url.searchParams.get("type"); // positif|negatif|sans_reponse|avec_reponse
  const service = url.searchParams.get("service");
  const dateFrom = url.searchParams.get("date_from");
  const dateTo = url.searchParams.get("date_to");
  const q = url.searchParams.get("q")?.trim();
  const limit = Math.min(LIMITE_MAX, Math.max(1, parseInt(url.searchParams.get("limit") || "", 10) || LIMITE_DEFAUT));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "", 10) || 0);

  let query = sb.from("avis")
    .select("id,note,commentaire,titre,reponse_institution,reponse_le,rdv_id,created_at")
    .eq("institution_id", authInstId)
    .eq("brouillon", false)
    .eq("masque", false);

  if (type === "positif") query = query.gte("note", NOTE_POSITIVE_MIN);
  if (type === "negatif") query = query.lte("note", NOTE_NEGATIVE_MAX);
  if (type === "sans_reponse") query = query.is("reponse_institution", null);
  if (type === "avec_reponse") query = query.not("reponse_institution", "is", null);
  if (dateFrom) query = query.gte("created_at", dateFrom);
  if (dateTo) query = query.lte("created_at", dateTo);
  if (q) query = query.ilike("commentaire", `%${q}%`);

  const { data: avisRaw, error } = await query.order("created_at", { ascending: false }).limit(PLAFOND_SQL);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const avis = avisRaw ?? [];

  const rdvIds = [...new Set(avis.map(a => a.rdv_id).filter((x): x is string => !!x))];
  const { data: rdvData } = rdvIds.length
    ? await sb.from("rdv").select("id,objet").eq("institution_id", authInstId).in("id", rdvIds)
    : { data: [] as { id: string; objet: string | null }[] };
  const objetParRdv = new Map((rdvData ?? []).map(r => [r.id, r.objet]));

  const avecService = avis.map(a => ({
    ...a,
    service: a.rdv_id ? extraireServiceDepuisObjet(objetParRdv.get(a.rdv_id) ?? null) : null,
  }));

  const servicesDisponibles = [...new Set(avecService.map(a => a.service).filter((s): s is string => !!s))].sort();
  const filtres = service ? avecService.filter(a => a.service === service) : avecService;

  return NextResponse.json({
    avis: filtres.slice(offset, offset + limit),
    total: filtres.length,
    limit, offset,
    servicesDisponibles,
  });
}

export async function POST() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
