// Protections anti-abus à l'edge (mission sécurité, 09/08/2026, décision
// CEO — suite de lib/geoAccess.ts) : "le géoblocage n'est qu'une couche,
// pas country bloqué = bot bloqué". Compatible Edge Runtime uniquement
// (aucune API Node) — lu depuis middleware.ts.
//
// Portée honnête : ce fichier couvre ce qui est réellement implémentable
// en code, sans dépendance externe payante ni accès à la configuration
// Netlify/WAF de cet environnement. Le reste (WAF managé, DDoS L3/L4,
// alerting, dashboards de monitoring) reste une action/config infra pour
// Bryan — voir le résumé de mission, pas fabriqué ici en faux-semblant.

/** Signatures d'outils de scan/exploitation automatisés connus — liste
 * volontairement conservatrice (aucun faux positif attendu sur un
 * navigateur ou un client HTTP légitime) : source de confiance haute,
 * bloqué sans confirmation supplémentaire. */
const UA_OUTILS_MALVEILLANTS = [
  /sqlmap/i, /nikto/i, /nessus/i, /nmap/i, /masscan/i, /zgrab/i,
  /acunetix/i, /netsparker/i, /w3af/i, /havij/i, /dirbuster/i,
  /gobuster/i, /wpscan/i, /metasploit/i, /nuclei/i, /commix/i,
];

/** User-Agent absent ou vide : quasi jamais un vrai navigateur (même les
 * anciens/exotiques envoient toujours quelque chose), signal fort de
 * script automatisé. */
export function estUserAgentSuspect(ua: string | null): boolean {
  if (!ua || ua.trim().length === 0) return true;
  return UA_OUTILS_MALVEILLANTS.some((rx) => rx.test(ua));
}

/** IP client réelle — x-nf-client-connection-ip (posée par Netlify,
 * non falsifiable par le visiteur) plutôt que x-forwarded-for (peut
 * contenir une chaîne de proxies arbitraire côté client). */
export function extraireIpClient(request: Request): string {
  const direct = request.headers.get("x-nf-client-connection-ip");
  if (direct) return direct;
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return "unknown";
}

// ─── Rate limiting edge (défense en profondeur, PAS un remplacement des
// rate limits déjà posés route par route — ex. lib/auth/otp.ts,
// app/api/citoyen/recuperation/route.ts — qui restent la protection fine
// par endpoint). État en mémoire d'instance edge : ne survit pas un
// redémarrage, ne se partage pas entre plusieurs instances distribuées.
// Fenêtre volontairement large (défaut 4 req/s soutenues) pour ne jamais
// pénaliser un réseau mobile guinéen à forte mutualisation NAT — seuil à
// ajuster par Bryan après observation du trafic réel une fois activé.
// Clé générique (pas juste l'IP) pour permettre un compteur séparé par
// catégorie de route (global vs endpoints sensibles ci-dessous) sans
// qu'un pic sur l'un fausse le seuil de l'autre. ──
const compteurs = new Map<string, { count: number; resetAt: number }>();
const FENETRE_MS = 60_000;
const MAX_REQUETES_PAR_FENETRE_DEFAUT = 240;

export function estRateLimite(cle: string, maxRequetes = MAX_REQUETES_PAR_FENETRE_DEFAUT): boolean {
  if (cle.endsWith(":unknown")) return false; // jamais bloquer faute de savoir qui c'est
  const maintenant = Date.now();
  const entry = compteurs.get(cle);
  if (!entry || entry.resetAt < maintenant) {
    compteurs.set(cle, { count: 1, resetAt: maintenant + FENETRE_MS });
    return false;
  }
  entry.count++;
  return entry.count > maxRequetes;
}

/** "Protection des endpoints sensibles" (brief) : seuil dédié, plus bas
 * que le générique, pour les chemins d'authentification/récupération —
 * ceux-ci ont déjà leur propre rate limit fin par endpoint (voir
 * lib/auth/otp.ts etc.), cette couche edge n'ajoute qu'un filet
 * supplémentaire en amont. Renvoie null si le chemin n'est pas considéré
 * sensible (le générique s'applique alors seul). */
const ENDPOINTS_SENSIBLES: { pattern: RegExp; max: number }[] = [
  { pattern: /^\/api\/(citoyen|institution|clock)\/auth\//, max: 20 },
  { pattern: /^\/api\/citoyen\/recuperation$/, max: 10 },
  { pattern: /^\/admin\/login$/, max: 20 },
  { pattern: /^\/api\/admin\/auth\/login$/, max: 20 },
];

export function seuilEndpointSensible(pathname: string): number | null {
  return ENDPOINTS_SENSIBLES.find((e) => e.pattern.test(pathname))?.max ?? null;
}

/** Log de sécurité structuré (brief : "logs de sécurité" + "surveillance
 * des erreurs et pics de trafic") — écrit sur la sortie standard, captée
 * par le flux de logs de fonctions Netlify (aucune infra à provisionner
 * pour avoir une trace exploitable). N'écrit jamais en base depuis
 * l'edge (latence/fiabilité) — une vraie agrégation/alerting (SIEM,
 * Slack/email sur pic) reste une décision d'outillage à prendre par
 * Bryan, non construite ici. */
export function logSecurite(evenement: string, detail: Record<string, unknown>) {
  console.warn(JSON.stringify({ securite: evenement, ts: new Date().toISOString(), ...detail }));
}

/** VPN / proxy / datacenter — signal optionnel via un service tiers
 * d'intelligence IP (ex. IPQualityScore). Désactivé tant que
 * IPQS_API_KEY n'est pas défini (fail-open explicite, jamais une clé en
 * dur ni un abonnement pris pour Bryan) — action requise de Bryan avant
 * que ce signal soit réellement actif. Timeout court + fail-open sur
 * toute erreur : un tiers lent/en panne ne doit jamais rendre Yelen
 * inaccessible. */
export async function estIpVpnOuProxy(ip: string): Promise<boolean> {
  const apiKey = process.env.IPQS_API_KEY;
  if (!apiKey || ip === "unknown") return false;
  try {
    const res = await fetch(
      `https://ipqualityscore.com/api/json/ip/${apiKey}/${encodeURIComponent(ip)}?strictness=1`,
      { signal: AbortSignal.timeout(1200) }
    );
    if (!res.ok) return false;
    const json = (await res.json()) as { vpn?: boolean; proxy?: boolean; tor?: boolean; recent_abuse?: boolean };
    return !!(json.vpn || json.proxy || json.tor || json.recent_abuse);
  } catch {
    return false;
  }
}
