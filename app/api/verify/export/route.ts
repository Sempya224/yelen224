import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extraireIpClient, logSecurite } from "@/lib/edgeSecurity";
import { enregistrerAction } from "@/lib/journalActivite";
import { lireCleSignature } from "@/lib/export/signature";
import {
  reponsePublique, verifierExportPublic, type DependancesVerification, type LigneExportPublique, type ResultatVerification,
} from "@/lib/export/verificationPublique";

// Vérification publique d'un export (24/10/2026) — route SANS authentification,
// ouverte par n'importe qui (un tiers à qui l'on remet un document). POST
// uniquement, empreinte dans le corps : jamais dans une URL, donc jamais dans
// des journaux d'accès. Aucune donnée personnelle renvoyée.
//
// Anti-énumération : la référence est séquentielle donc devinable ; seule
// l'empreinte est secrète. Référence inconnue, mauvaise empreinte, entrée mal
// formée et HMAC invalide donnent la MÊME réponse `{ verifie: false }` (même
// statut, même forme). Aucun effet de bord sur un échec.
//
// ⚠️ Plafond par IP en MÉMOIRE d'instance (comme api/verify/recu) : sur
// serverless chaque instance a son compteur, il est donc contournable ; c'est
// un filet, doublé par la limite edge (lib/edgeSecurity.ts). Un plafond
// persistant passerait par lib/security/authSecurity (migration).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const FENETRE_MS = 15 * 60 * 1000;
const MAX_PAR_FENETRE = 30;
const TAILLE_MAX_CORPS = 2048;
const essais = new Map<string, { count: number; resetAt: number }>();

function plafondAtteint(ip: string): boolean {
  const maintenant = Date.now();
  if (essais.size > 2000) {
    for (const [cle, v] of essais) if (v.resetAt < maintenant) essais.delete(cle);
  }
  const e = essais.get(ip);
  if (!e || e.resetAt < maintenant) {
    essais.set(ip, { count: 1, resetAt: maintenant + FENETRE_MS });
    return false;
  }
  if (e.count >= MAX_PAR_FENETRE) return true;
  e.count++;
  return false;
}

const SANS_CACHE = { "Cache-Control": "no-store" };

const dependances: DependancesVerification = {
  charger: async (reference): Promise<LigneExportPublique | null> => {
    const { data, error } = await sb
      .from("exports")
      .select("id,reference,type,institution_id,hash_contenu,signature_hmac,cle_version,nb_lignes,version_gabarit,cree_le")
      .eq("reference", reference)
      .maybeSingle();
    if (error) throw new Error(`lecture exports: ${error.code ?? "erreur"}`);
    return (data ?? null) as LigneExportPublique | null;
  },
  lireCle: (version) => lireCleSignature(version),
  nomEtablissement: async (institutionId) => {
    const { data } = await sb.from("institutions").select("name").eq("id", institutionId).maybeSingle();
    return (data?.name as string | undefined) ?? null;
  },
};

export async function POST(req: NextRequest) {
  const ip = extraireIpClient(req);
  if (plafondAtteint(ip)) {
    logSecurite("export_verification_plafond", { ip });
    return NextResponse.json({ code: "RATE_LIMITED" }, { status: 429, headers: { ...SANS_CACHE, "Retry-After": "900" } });
  }

  // Corps illisible, trop gros ou invalide : traité comme une entrée mal formée
  // (même réponse que toute autre issue négative).
  let corps: Record<string, unknown> = {};
  try {
    const texte = await req.text();
    if (texte.length <= TAILLE_MAX_CORPS) {
      const j: unknown = JSON.parse(texte);
      if (j && typeof j === "object" && !Array.isArray(j)) corps = j as Record<string, unknown>;
    }
  } catch { /* corps = {} */ }

  let resultat: ResultatVerification;
  try {
    resultat = await verifierExportPublic({ reference: corps.reference, empreinte: corps.empreinte }, dependances);
  } catch (err) {
    // Clé absente / base indisponible : jamais « non vérifié », qui induirait en erreur.
    console.error("[VerifyExport] vérification impossible:", err instanceof Error ? err.message : "erreur inconnue");
    return NextResponse.json({ error: "Vérification indisponible" }, { status: 500, headers: SANS_CACHE });
  }

  if (!resultat.verifie) {
    // Hash égal mais HMAC invalide : ligne altérée en base ou mauvaise clé.
    // Alerte interne sans empreinte ni référence complète.
    if (resultat.raison === "signature") logSecurite("export_signature_invalide", { ip });
    return NextResponse.json(reponsePublique(resultat), { status: 200, headers: SANS_CACHE });
  }

  // Trace dans le journal de l'établissement, sur vérification RÉUSSIE seulement.
  // Volontairement sans `req` : l'IP et le navigateur du tiers qui vérifie ne
  // sont pas communiqués à l'établissement. Aucune donnée sensible dans details.
  await enregistrerAction({
    institutionId: resultat.interne.institutionId,
    membreId: null,
    membreNom: "Vérification publique",
    action: "export_verifie",
    cibleTable: "exports",
    cibleId: resultat.interne.exportId,
    details: { reference: resultat.document.reference, type: resultat.interne.typeCode },
  });

  return NextResponse.json(reponsePublique(resultat), { status: 200, headers: SANS_CACHE });
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
