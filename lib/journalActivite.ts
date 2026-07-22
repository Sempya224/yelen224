import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { ACTION_CATEGORIE, NIVEAU_PAR_DEFAUT, type NiveauJournal } from "./journalTaxonomie";

// Journal d'activité — traçabilité par membre (migration 20260715000001,
// fondations d'audit 20260723000001). Insert non-bloquant : une erreur ici
// ne doit jamais faire échouer l'action métier appelante (même esprit que
// logRdvEvent dans lib/notifications.ts).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Petit utilitaire partagé — évite de refaire ce SELECT dans chaque route
// qui journalise une action.
export async function getMembreNomPourJournal(membreId: string): Promise<string> {
  const { data } = await sb.from("institution_membres").select("prenom,nom").eq("id", membreId).maybeSingle();
  return data ? `${data.prenom} ${data.nom}` : "Inconnu";
}

type Plateforme = "web" | "mobile" | "tablette" | "api";

// Best-effort à partir du user-agent brut — pas un vrai parseur (aucune
// dépendance de ce type dans le projet). Suffisant pour Lot A (fiabilité
// fine reportée à un lot ultérieur avec "appareil connu"). Exporté pour
// être réutilisé par lib/auth/citoyenSession.ts (Lot D, remember token
// citoyen) plutôt que redévelopper un second parseur de user-agent.
export function extraireContexteRequete(req?: NextRequest): {
  ip: string | null; userAgent: string | null; navigateur: string | null; os: string | null; plateforme: Plateforme;
} {
  if (!req) return { ip: null, userAgent: null, navigateur: null, os: null, plateforme: "api" };

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || null;
  const userAgent = req.headers.get("user-agent");
  if (!userAgent) return { ip, userAgent: null, navigateur: null, os: null, plateforme: "api" };

  const isTablette = /iPad|Tablet|Android(?!.*Mobile)/i.test(userAgent);
  const isMobile = !isTablette && /Mobile|iPhone|Android/i.test(userAgent);
  const plateforme: Plateforme = isTablette ? "tablette" : isMobile ? "mobile" : "web";

  let navigateur = "Autre";
  if (/Edg\//i.test(userAgent)) navigateur = "Edge";
  else if (/OPR\//i.test(userAgent) || /Opera/i.test(userAgent)) navigateur = "Opera";
  else if (/CriOS\//i.test(userAgent) || (/Chrome\//i.test(userAgent) && !/Edg\//i.test(userAgent))) navigateur = "Chrome";
  else if (/Firefox\//i.test(userAgent) || /FxiOS\//i.test(userAgent)) navigateur = "Firefox";
  else if (/Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent)) navigateur = "Safari";

  let os = "Autre";
  if (/Windows/i.test(userAgent)) os = "Windows";
  else if (/Android/i.test(userAgent)) os = "Android";
  else if (/iPhone|iPad|iOS/i.test(userAgent)) os = "iOS";
  else if (/Mac OS X|Macintosh/i.test(userAgent)) os = "macOS";
  else if (/Linux/i.test(userAgent)) os = "Linux";

  return { ip, userAgent, navigateur, os, plateforme };
}

export async function enregistrerAction(params: {
  institutionId: string;
  // null quand l'action est initiée par un citoyen, pas un membre de
  // l'institution (ex. message_recu) — membre_id est une FK nullable
  // (ON DELETE SET NULL) vers institution_membres, membre_nom reste
  // toujours renseigné (nom du citoyen dans ce cas).
  membreId: string | null;
  membreNom: string;
  action: string;
  cibleTable: string;
  cibleId?: string;
  details?: Record<string, unknown>;
  ancienneValeur?: Record<string, unknown> | null;
  nouvelleValeur?: Record<string, unknown> | null;
  niveau?: NiveauJournal;
  req?: NextRequest;
}): Promise<void> {
  const { ip, userAgent, navigateur, os, plateforme } = extraireContexteRequete(params.req);
  const { error } = await sb.from("journal_activite").insert({
    institution_id: params.institutionId,
    membre_id: params.membreId,
    membre_nom: params.membreNom,
    action: params.action,
    cible_table: params.cibleTable,
    cible_id: params.cibleId ?? null,
    details: params.details ?? {},
    ancienne_valeur: params.ancienneValeur ?? null,
    nouvelle_valeur: params.nouvelleValeur ?? null,
    categorie: ACTION_CATEGORIE[params.action] ?? "autre",
    niveau: params.niveau ?? NIVEAU_PAR_DEFAUT[params.action] ?? "info",
    ip,
    user_agent: userAgent,
    navigateur,
    os,
    plateforme,
  });
  if (error) console.error("[JournalActivite] Erreur insertion:", error.message);
}
