"use client";
// ═══════════════════════════════════════════════════════════════════════
// YELEN Accueil — check-in mobile isolé du dashboard institution.
// Voir docs/security/YELEN_ACCUEIL_CHECKIN_DESIGN.md pour la conception
// complète. Aucune dépendance au ThemeProvider/Button/Card du dashboard
// (app/[slug]/[id]/**) — surface volontairement autonome, même principe
// que app/clock/[slug]/page.tsx (portail employé Clock In Shift).
//
// Périmètre V1 (arbitrages Bryan, 13/09/2026, revirement le même jour) :
// RDV gratuits uniquement. 1er accès = scan du badge QR agent PUIS PIN
// (le badge seul ne prouve rien, le PIN authentifie réellement — voir
// app/api/checkin/agent/identify + app/api/checkin/auth). Session 8h max,
// verrou d'inactivité 2 min (PIN seul pour déverrouiller, pas de re-scan
// tant que la session est valide), pas de validation offline.
// ═══════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { Html5Qrcode } from "html5-qrcode";
import { YelenLoader } from "@/components/YelenLoader";

const OR = "#F5A623";
const BG = "#FFFFFF";
const BG2 = "#F5F5F5";
const BORDER = "#E1E1E1";
const T1 = "#1C1400";
const T2 = "#767676";
const RED = "#B3261E";
const GREEN = "#0F8A5F";

const INACTIVITY_LOCK_MS = 2 * 60 * 1000;

// Divulgation caméra "in-app" affichée une seule fois avant la 1ère demande
// de permission native (badge OU QR de rendez-vous, même permission
// caméra) — exigence Play Store de divulgation visible avant tout accès à
// une permission sensible. Persistée en localStorage (jamais ressaisie à
// chaque scan, l'agent en fait des dizaines par session).
const CAM_DISCLOSURE_KEY = "yelen224_checkin_camera_disclosure_vu";
function camDisclosureVue(): boolean {
  try { return localStorage.getItem(CAM_DISCLOSURE_KEY) === "1"; } catch { return false; }
}
function marquerCamDisclosureVue() {
  try { localStorage.setItem(CAM_DISCLOSURE_KEY, "1"); } catch {}
}

function dateDuJour(): string {
  const s = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type Ecran =
  | "chargement" | "scan_badge" | "pin_connexion" | "verrouille" | "scanner"
  | "resultat" | "confirmation";

type RdvMinimal = { id: string; heure_rdv: string; service: string | null; citoyen_affichage: string; statut: string };
type Historique = { id: string; heure_scan: string; citoyen_affichage: string; service: string | null; heure_rdv: string };

async function appelJson(url: string, options?: RequestInit) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, offline: true, status: 0, data: { error: "Hors ligne" } };
  }
  try {
    const res = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options?.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, offline: false, status: res.status, data };
  } catch {
    return { ok: false, offline: true, status: 0, data: { error: "Hors ligne" } };
  }
}

export function CheckInApp({ institutionNom, institutionLogo, institutionSlug, badgeTokenInitial }: { institutionNom: string; institutionLogo: string | null; institutionSlug: string; badgeTokenInitial: string | null }) {
  const [ecran, setEcran] = useState<Ecran>("chargement");
  const [prenom, setPrenom] = useState("");
  const [erreur, setErreur] = useState("");
  const [rdv, setRdv] = useState<RdvMinimal | null>(null);
  const [historique, setHistorique] = useState<Historique[]>([]);
  const [horsLigne, setHorsLigne] = useState(false);
  const [challengeToken, setChallengeToken] = useState("");
  const [erreurBadgeAuto, setErreurBadgeAuto] = useState("");
  // Rappel "fermer votre session" (16/09/2026) — état mémoire, jamais
  // localStorage : doit réapparaître à chaque nouvelle connexion PIN ou
  // déverrouillage (une vraie reprise en main de l'appareil), mais surtout
  // PAS à une simple reprise de session déjà valide au chargement de la
  // page (/api/checkin/me ok ci-dessous, qui saute directement sur
  // "scanner" sans repasser par onConnecte/onDeverrouille).
  const [rappelSessionVisible, setRappelSessionVisible] = useState(false);

  // useRef n'a pas d'initialiseur paresseux — Date.now() est réévalué (et
  // ignoré) à chaque rendu après le premier, geste laissé tel quel pour ne
  // pas toucher au timing du verrou d'inactivité pendant le gel produit.
  // eslint-disable-next-line react-hooks/purity
  const dernierActiviteRef = useRef(Date.now());

  const marquerActivite = useCallback(() => { dernierActiviteRef.current = Date.now(); }, []);

  // Vérification initiale de session — décide de l'écran de départ sans
  // jamais afficher le scanner avant confirmation serveur. Si l'URL porte
  // un ?badge=... (scan du badge via l'appareil photo natif du téléphone,
  // qui ouvre une vraie URL https plutôt que notre caméra interne),
  // l'identification est tentée automatiquement — l'agent atterrit
  // directement sur l'écran PIN sans repasser par un scan manuel.
  useEffect(() => {
    // Retire le token de l'URL/historique navigateur immédiatement, qu'une
    // session soit déjà active ou non, utilisé avec succès ou non — jamais
    // laissé traîner dans l'adresse une fois lu.
    if (badgeTokenInitial && typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }
    (async () => {
      const r = await appelJson("/api/checkin/me");
      if (r.offline) { setHorsLigne(true); setEcran("scan_badge"); return; }
      if (r.ok) {
        setPrenom(r.data.prenom || "");
        setEcran(r.data.locked ? "verrouille" : "scanner");
        return;
      }

      if (badgeTokenInitial) {
        const ri = await appelJson("/api/checkin/agent/identify", { method: "POST", body: JSON.stringify({ token: badgeTokenInitial }) });
        if (!ri.offline && ri.ok) {
          setChallengeToken((ri.data as { challengeToken?: string }).challengeToken || "");
          setPrenom((ri.data as { prenom?: string }).prenom || "");
          setEcran("pin_connexion");
          return;
        }
        setErreurBadgeAuto((ri.data as { error?: string })?.error || "Badge invalide, rescannez-le.");
      }
      setEcran("scan_badge");
    })();
  }, [badgeTokenInitial]);

  useEffect(() => {
    const onOnline = () => setHorsLigne(false);
    const onOffline = () => setHorsLigne(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);

  // Verrou d'inactivité côté client (2 min) — reflète la même règle que le
  // serveur (lib/checkinAuth.ts::CHECKIN_INACTIVITY_LOCK_MS), pour ne pas
  // laisser l'agent taper une action qui échouera silencieusement côté
  // serveur. Le serveur reste la barrière réelle (voir /api/checkin/*).
  useEffect(() => {
    if (ecran !== "scanner" && ecran !== "resultat" && ecran !== "confirmation") return;
    const interval = setInterval(() => {
      if (Date.now() - dernierActiviteRef.current > INACTIVITY_LOCK_MS) setEcran("verrouille");
    }, 5000);
    const evenements = ["mousedown", "touchstart", "keydown"];
    evenements.forEach((e) => window.addEventListener(e, marquerActivite));
    return () => {
      clearInterval(interval);
      evenements.forEach((e) => window.removeEventListener(e, marquerActivite));
    };
  }, [ecran, marquerActivite]);

  function traiterEchecSession(status: number, data: Record<string, unknown>) {
    if (status === 401) { setEcran("scan_badge"); return true; }
    if (status === 423 && data.code === "SESSION_LOCKED") { setEcran("verrouille"); return true; }
    return false;
  }

  return (
    <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column", fontFamily: "var(--font-jakarta, system-ui)" }}>
      {(ecran === "scanner" || ecran === "resultat" || ecran === "confirmation") && (
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: `1px solid ${BORDER}` }}>
          {institutionLogo ? (
            <div style={{ width: "40px", height: "40px", borderRadius: "50%", overflow: "hidden", border: `1px solid ${BORDER}`, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", flexShrink: 0 }}>
              <Image src={institutionLogo} alt="" width={40} height={40} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          ) : <span />}
          <span style={{ color: T2, fontSize: "12px", fontWeight: 700 }}>{dateDuJour()}</span>
          <BoutonDeconnexion onDeconnecte={() => setEcran("scan_badge")} />
        </header>
      )}

      {rappelSessionVisible && (ecran === "scanner" || ecran === "resultat" || ecran === "confirmation") && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", background: `${OR}15`, borderBottom: `1px solid ${OR}40`, padding: "10px 16px" }}>
          <div style={{ flex: 1, color: T1, fontSize: "12px", fontWeight: 600, lineHeight: 1.5 }}>
            <strong>Important —</strong> n&apos;oubliez pas de fermer votre session (« Terminer ma session », en haut) avant de quitter le poste.
          </div>
          <button onClick={() => setRappelSessionVisible(false)} aria-label="Fermer" style={{ background: "none", border: "none", color: T1, cursor: "pointer", padding: "2px", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}

      {horsLigne && (
        <div style={{ background: "#FFF4E0", color: "#8A5A00", fontSize: "12px", fontWeight: 700, textAlign: "center", padding: "8px" }}>
          Hors ligne — connexion requise pour confirmer une présence.
        </div>
      )}

      <main style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px", maxWidth: "480px", width: "100%", margin: "0 auto" }}>
        {ecran === "chargement" && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <YelenLoader size={36} label="Chargement…" labelColor={T2} />
          </div>
        )}

        {ecran === "scan_badge" && (
          <EcranScanBadge
            institutionNom={institutionNom}
            institutionLogo={institutionLogo}
            institutionSlug={institutionSlug}
            erreurInitiale={erreurBadgeAuto}
            onIdentifie={(token, p) => { setChallengeToken(token); setPrenom(p); setEcran("pin_connexion"); }}
          />
        )}

        {ecran === "pin_connexion" && (
          <EcranPinConnexion
            prenom={prenom}
            challengeToken={challengeToken}
            onConnecte={(p) => { setPrenom(p); marquerActivite(); setRappelSessionVisible(true); setEcran("scanner"); }}
            onBadgeExpire={() => { setChallengeToken(""); setEcran("scan_badge"); }}
          />
        )}

        {ecran === "verrouille" && (
          <EcranVerrouille
            prenom={prenom}
            onDeverrouille={() => { marquerActivite(); setRappelSessionVisible(true); setEcran("scanner"); }}
            onSessionExpiree={() => setEcran("scan_badge")}
          />
        )}

        {ecran === "scanner" && (
          <EcranScanner
            prenom={prenom}
            historique={historique}
            onResultat={(r) => { marquerActivite(); setRdv(r); setEcran("resultat"); }}
            onEchecSession={traiterEchecSession}
          />
        )}

        {ecran === "resultat" && rdv && (
          <EcranResultat
            rdv={rdv}
            onConfirme={() => {
              marquerActivite();
              setHistorique((h) => [{
                id: rdv.id,
                heure_scan: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
                citoyen_affichage: rdv.citoyen_affichage,
                service: rdv.service,
                heure_rdv: rdv.heure_rdv,
              }, ...h]);
              setEcran("confirmation");
            }}
            onAnnuler={() => { setRdv(null); setEcran("scanner"); }}
            onEchecSession={traiterEchecSession}
            setErreur={setErreur}
          />
        )}

        {ecran === "confirmation" && (
          <EcranConfirmation onSuivant={() => { setRdv(null); marquerActivite(); setEcran("scanner"); }} />
        )}

        {erreur && (
          <div style={{ marginTop: "12px" }}>
            <ErreurBanner message={erreur} onFermer={() => setErreur("")} />
          </div>
        )}
      </main>
    </div>
  );
}

function BoutonDeconnexion({ onDeconnecte }: { onDeconnecte: () => void }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button onClick={() => setOuvert(true)} style={btnGhost}>Terminer ma session</button>
      {ouvert && <TerminerSessionModal onFermer={() => setOuvert(false)} onFerme={onDeconnecte} />}
    </>
  );
}

// Popup de fin de session (16/09/2026) — remplace l'ancien bascule
// Annuler/Confirmer inline dans le header, qui appelait onDeconnecte()
// SANS jamais vérifier le résultat de l'appel serveur (offline ou 500 →
// l'agent se retrouvait quand même renvoyé sur "scan_badge", pensant sa
// session close, alors que le cookie httpOnly côté serveur n'avait
// jamais été révoqué). Ici, onFerme() n'est appelé qu'après un vrai 200.
function TerminerSessionModal({ onFermer, onFerme }: { onFermer: () => void; onFerme: () => void }) {
  const [etat, setEtat] = useState<"confirmer" | "encours" | "succes" | "erreur">("confirmer");
  const [erreur, setErreur] = useState("");

  async function confirmer() {
    setEtat("encours");
    const r = await appelJson("/api/checkin/logout", { method: "POST" });
    if (!r.ok) {
      setErreur(r.offline ? "Hors ligne — connexion requise pour fermer la session." : ((r.data as { error?: string })?.error || "La fermeture a échoué. Réessayez."));
      setEtat("erreur");
      return;
    }
    setEtat("succes");
    setTimeout(onFerme, 1100);
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div onClick={etat === "encours" || etat === "succes" ? undefined : onFermer} style={{ position: "absolute", inset: 0, background: "rgba(28,20,0,0.45)" }} />
      <div style={{ position: "relative", width: "100%", maxWidth: "360px", background: BG, borderRadius: "18px", padding: "24px", boxShadow: "0 12px 40px rgba(28,20,0,0.25)", textAlign: "center" }}>
        {etat === "confirmer" && (
          <>
            <div style={{ color: T1, fontSize: "16px", fontWeight: 800, marginBottom: "8px" }}>Terminer votre session ?</div>
            <p style={{ color: T2, fontSize: "13px", lineHeight: 1.5, marginBottom: "20px" }}>
              Vous devrez rescanner votre badge et ressaisir votre PIN pour reprendre le poste d&apos;accueil.
            </p>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={onFermer} style={{ flex: 1, minHeight: "48px", padding: "13px", borderRadius: "12px", border: `1px solid ${BORDER}`, background: "none", color: T1, fontWeight: 700, fontSize: "14px", cursor: "pointer" }}>Annuler</button>
              <button onClick={confirmer} style={{ flex: 1, minHeight: "48px", padding: "13px", borderRadius: "12px", border: "none", background: RED, color: "#fff", fontWeight: 800, fontSize: "14px", cursor: "pointer" }}>Terminer</button>
            </div>
          </>
        )}

        {etat === "encours" && (
          <div style={{ padding: "18px 0" }}>
            <YelenLoader size={32} label="Fermeture de la session…" labelColor={T2} />
          </div>
        )}

        {etat === "succes" && (
          <div style={{ padding: "8px 0" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(47,191,113,0.15)", border: `2px solid ${GREEN}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <div style={{ color: GREEN, fontSize: "15px", fontWeight: 800 }}>Session fermée</div>
          </div>
        )}

        {etat === "erreur" && (
          <>
            <div style={{ color: T1, fontSize: "16px", fontWeight: 800, marginBottom: "8px" }}>La fermeture a échoué</div>
            <p style={{ color: RED, fontSize: "13px", fontWeight: 600, lineHeight: 1.5, marginBottom: "20px" }}>{erreur}</p>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={onFermer} style={{ flex: 1, minHeight: "48px", padding: "13px", borderRadius: "12px", border: `1px solid ${BORDER}`, background: "none", color: T1, fontWeight: 700, fontSize: "14px", cursor: "pointer" }}>Annuler</button>
              <button onClick={confirmer} style={{ flex: 1, minHeight: "48px", padding: "13px", borderRadius: "12px", border: "none", background: RED, color: "#fff", fontWeight: 800, fontSize: "14px", cursor: "pointer" }}>Réessayer</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const btnGhost: CSSProperties = { background: "transparent", border: `1px solid ${BORDER}`, color: T2, fontSize: "11px", fontWeight: 700, borderRadius: "8px", padding: "6px 10px", cursor: "pointer" };

// Bannière d'erreur partagée (16/09/2026) — message toujours affiché en
// entier (jamais tronqué "quelques mots puis on s'arrête") + bouton X
// explicite pour la fermer, remplace les anciens <div>{erreur}</div> muets
// dupliqués dans chaque écran.
function ErreurBanner({ message, onFermer }: { message: string; onFermer: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", background: "rgba(229,72,77,0.12)", border: `1px solid ${RED}40`, color: RED, borderRadius: "12px", padding: "10px 14px", fontSize: "12.5px", fontWeight: 600, lineHeight: 1.5 }}>
      <span style={{ flex: 1 }}>{message}</span>
      <button onClick={onFermer} aria-label="Fermer" style={{ background: "none", border: "none", color: RED, cursor: "pointer", padding: "2px", flexShrink: 0 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  );
}

// Extrait le token opaque du contenu du badge QR agent. Le badge encode
// une vraie URL https (.../check-in/{slug}?badge=<token>, générée par
// app/api/institution/equipe/checkin-qr) — trouvaille terrain 13/09/2026 :
// un schéma personnalisé (yelen://...) n'est pas reconnu par l'appareil
// photo natif des téléphones ("No usable data found" sur iOS), une URL
// https l'est partout. Tolère aussi l'ancien format yelen:// (badges déjà
// imprimés) et un token brut sans schéma.
function extraireTokenBadge(decodedText: string): string {
  try {
    const url = new URL(decodedText);
    const badge = url.searchParams.get("badge");
    if (badge) return badge;
  } catch {
    // Pas une URL — token brut ou ancien schéma yelen://, traité ci-dessous.
  }
  const prefixe = "yelen://agent-auth/v1/";
  return decodedText.startsWith(prefixe) ? decodedText.slice(prefixe.length) : decodedText;
}

// Divulgation "in-app" avant la 1ère demande de permission caméra native —
// voir CAM_DISCLOSURE_KEY. N'affirme "les images ne sont pas enregistrées"
// que parce que c'est vrai techniquement (html5-qrcode traite le flux en
// mémoire, jamais de captureImage/enregistrement) — à reformuler si ça change.
function CameraDisclosureModal({ onContinuer, onAnnuler }: { onContinuer: () => void; onAnnuler: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div onClick={onAnnuler} style={{ position: "absolute", inset: 0, background: "rgba(28,20,0,0.45)" }} />
      <div style={{ position: "relative", width: "100%", maxWidth: "360px", background: BG, borderRadius: "18px", padding: "22px", boxShadow: "0 12px 40px rgba(28,20,0,0.25)" }}>
        <div style={{ width: "72px", height: "72px", margin: "0 auto 14px" }}>
          <Image src="/illustrations/checkin-camera-permission-icon.png" alt="" width={1254} height={1254} sizes="72px" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        </div>
        <div style={{ color: T1, fontSize: "16px", fontWeight: 800, textAlign: "center", marginBottom: "10px" }}>Autoriser l&apos;accès à la caméra ?</div>
        <div style={{ color: T2, fontSize: "13.5px", lineHeight: 1.5, textAlign: "center", marginBottom: "20px" }}>
          YELEN utilise votre caméra uniquement pour scanner le QR code de votre badge agent et les QR codes de rendez-vous. Les images ne sont pas enregistrées.
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onAnnuler} style={{ flex: 1, minHeight: "48px", padding: "13px", borderRadius: "12px", border: `1px solid ${BORDER}`, background: "none", color: T2, fontWeight: 700, fontSize: "14px", cursor: "pointer" }}>Annuler</button>
          <button onClick={onContinuer} style={{ flex: 1, minHeight: "48px", padding: "13px", borderRadius: "12px", border: "none", background: OR, color: "#111", fontWeight: 800, fontSize: "14px", cursor: "pointer" }}>Continuer</button>
        </div>
      </div>
    </div>
  );
}

// Bottom sheet "Besoin d'aide ?" — jamais de réinitialisation de PIN
// autonome ici (un agent ne doit pas pouvoir se redonner accès seul à
// partir d'informations publiques) : uniquement rediriger vers le
// responsable/support, qui régénère le badge côté administration.
function AideSheet({ institutionSlug, onFermer }: { institutionSlug: string; onFermer: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={onFermer} style={{ position: "absolute", inset: 0, background: "rgba(28,20,0,0.45)" }} />
      <div style={{ position: "relative", width: "100%", maxWidth: "480px", background: BG, borderRadius: "20px 20px 0 0", padding: "14px 22px calc(20px + env(safe-area-inset-bottom))", boxShadow: "0 -8px 30px rgba(28,20,0,0.2)" }}>
        <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: BORDER, margin: "0 auto 18px" }} />
        <div style={{ color: T1, fontSize: "17px", fontWeight: 800, marginBottom: "14px" }}>Besoin d&apos;aide ?</div>

        <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: "14px", padding: "14px 16px", marginBottom: "14px" }}>
          <div style={{ color: T1, fontSize: "13.5px", fontWeight: 700, marginBottom: "4px" }}>Badge perdu ou PIN oublié ?</div>
          <div style={{ color: T2, fontSize: "13px", lineHeight: 1.5 }}>
            Contactez votre responsable ou le support YELEN — un badge perdu doit être désactivé et régénéré depuis l&apos;administration, jamais réinitialisé depuis cet écran.
          </div>
        </div>

        <a
          href="mailto:support@yelen224.com"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "48px", gap: "8px", background: `${OR}15`, border: `1px solid ${OR}40`, borderRadius: "12px", padding: "13px", marginBottom: "16px", color: T1, fontWeight: 800, fontSize: "14px", textDecoration: "none" }}
        >
          Contacter le support — support@yelen224.com
        </a>

        <div style={{ color: T2, fontSize: "12px", marginBottom: "18px" }}>
          Établissement : {institutionSlug.toUpperCase()}
        </div>

        <button onClick={onFermer} style={{ width: "100%", minHeight: "48px", padding: "13px", borderRadius: "12px", border: `1px solid ${BORDER}`, background: "none", color: T1, fontWeight: 700, fontSize: "14px", cursor: "pointer" }}>Fermer</button>
      </div>
    </div>
  );
}

function EcranScanBadge({ institutionNom, institutionLogo, institutionSlug, erreurInitiale, onIdentifie }: { institutionNom: string; institutionLogo: string | null; institutionSlug: string; erreurInitiale?: string; onIdentifie: (challengeToken: string, prenom: string) => void }) {
  const [camPhase, setCamPhase] = useState<"avant" | "demarrage" | "actif" | "refuse">("avant");
  const [erreur, setErreur] = useState(erreurInitiale || "");
  const [enCours, setEnCours] = useState(false);
  const [disclosureOuverte, setDisclosureOuverte] = useState(false);
  const [aideOuverte, setAideOuverte] = useState(false);
  const html5QrRef = useRef<Html5Qrcode | null>(null);

  function arreterCameraSiActive(html5QrCode: Html5Qrcode | null) {
    if (!html5QrCode?.isScanning) return;
    try { html5QrCode.stop().catch(() => {}); } catch {}
  }

  const traiterBadge = useCallback(async (decodedText: string) => {
    setEnCours(true);
    setErreur("");
    const r = await appelJson("/api/checkin/agent/identify", { method: "POST", body: JSON.stringify({ token: extraireTokenBadge(decodedText) }) });
    setEnCours(false);
    if (r.offline) { setErreur("Hors ligne — connexion requise pour s'identifier."); return; }
    const data = r.data as { error?: string; challengeToken?: string; prenom?: string };
    if (!r.ok) { setErreur(data.error || "Ce badge n'est pas reconnu."); return; }
    onIdentifie(data.challengeToken || "", data.prenom || "");
  }, [onIdentifie]);

  async function demarrerCamera() {
    setCamPhase("demarrage");
    try {
      const html5QrCode = new Html5Qrcode("qr-reader-badge");
      html5QrRef.current = html5QrCode;
      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText: string) => {
          arreterCameraSiActive(html5QrCode);
          setCamPhase("avant");
          void traiterBadge(decodedText);
        },
        () => {},
      );
      setCamPhase("actif");
    } catch {
      setCamPhase("refuse");
    }
  }

  function demanderCamera() {
    if (camDisclosureVue()) { void demarrerCamera(); return; }
    setDisclosureOuverte(true);
  }

  useEffect(() => () => arreterCameraSiActive(html5QrRef.current), []);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: "14px" }}>
      <div style={{ width: 96, height: 96, borderRadius: 24, overflow: "hidden", position: "relative", background: `${OR}20`, border: `1px solid ${OR}40`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px" }}>
        {institutionLogo ? (
          <Image src={institutionLogo} alt="" fill sizes="96px" style={{ objectFit: "cover" }} />
        ) : (
          <span style={{ color: OR, fontSize: "34px", fontWeight: 900 }}>{institutionNom.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div style={{ color: T1, fontSize: "20px", fontWeight: 800, textAlign: "center" }}>{institutionNom} Accueil</div>
      <div style={{ color: T2, fontSize: "12.5px", textAlign: "center", marginBottom: "8px" }}>Scannez le QR code de votre badge agent pour ouvrir votre session.</div>

      <div style={{ position: "relative", display: (camPhase === "actif" || camPhase === "demarrage") ? "block" : "none" }}>
        <div id="qr-reader-badge" style={{ borderRadius: "16px", overflow: "hidden", backgroundColor: BG2, minHeight: "260px" }} />
        {(camPhase === "demarrage" || enCours) && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <YelenLoader size={36} label={enCours ? "Vérification…" : "Ouverture de la caméra…"} labelColor={T2} />
          </div>
        )}
      </div>

      {camPhase === "avant" && (
        <div style={{ textAlign: "center", padding: "16px 12px 28px", background: BG2, borderRadius: "16px", border: `1px solid ${BORDER}` }}>
          <div style={{ borderRadius: "14px", overflow: "hidden", margin: "0 auto 16px" }}>
            <Image src="/illustrations/checkin-scan-badge-hero.png" alt="" width={1536} height={1024} sizes="320px" style={{ width: "100%", height: "auto", display: "block" }} />
          </div>
          <button onClick={demanderCamera} style={btnPrimary}>Scanner mon badge</button>
        </div>
      )}
      {camPhase === "refuse" && (
        <div style={{ textAlign: "center", padding: "24px 12px", background: BG2, borderRadius: "16px", border: `1px solid ${BORDER}` }}>
          <div style={{ color: T1, fontSize: "14px", fontWeight: 800, marginBottom: "6px" }}>Caméra indisponible</div>
          <div style={{ color: T2, fontSize: "12px", marginBottom: "16px" }}>Autorisez la caméra, ou contactez votre administrateur.</div>
          <button onClick={demanderCamera} style={btnGhost}>Réessayer</button>
        </div>
      )}

      {erreur && <ErreurBanner message={erreur} onFermer={() => setErreur("")} />}

      <div style={{ textAlign: "center", marginTop: "8px" }}>
        <p style={{ color: T2, fontSize: "13px", lineHeight: 1.5, margin: "0 0 10px" }}>
          En ouvrant une session, vous acceptez les{" "}
          <Link href="/cgu" style={{ color: T1, fontWeight: 700, textDecoration: "underline", textDecorationColor: OR, textUnderlineOffset: "3px" }}>Conditions d&apos;utilisation</Link>
          {" "}et reconnaissez avoir lu notre{" "}
          <Link href="/confidentialite" style={{ color: T1, fontWeight: 700, textDecoration: "underline", textDecorationColor: OR, textUnderlineOffset: "3px" }}>Politique de confidentialité</Link>.
        </p>
        <button
          onClick={() => setAideOuverte(true)}
          style={{ background: "none", border: "none", color: OR, fontSize: "14px", fontWeight: 800, textDecoration: "underline", cursor: "pointer", padding: "10px", minHeight: "44px" }}
        >
          Besoin d&apos;aide ?
        </button>
        <div style={{ color: T2, fontSize: "11.5px", marginTop: "2px" }}>© 2026 YELEN</div>
      </div>

      {disclosureOuverte && (
        <CameraDisclosureModal
          onContinuer={() => { marquerCamDisclosureVue(); setDisclosureOuverte(false); void demarrerCamera(); }}
          onAnnuler={() => setDisclosureOuverte(false)}
        />
      )}
      {aideOuverte && <AideSheet institutionSlug={institutionSlug} onFermer={() => setAideOuverte(false)} />}
    </div>
  );
}

function EcranPinConnexion({ prenom, challengeToken, onConnecte, onBadgeExpire }: {
  prenom: string; challengeToken: string; onConnecte: (prenom: string) => void; onBadgeExpire: () => void;
}) {
  const [pin, setPin] = useState("");
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);

  async function connecter(e: FormEvent) {
    e.preventDefault();
    setErreur("");
    setChargement(true);
    const r = await appelJson("/api/checkin/auth", { method: "POST", body: JSON.stringify({ challengeToken, pin }) });
    setChargement(false);
    if (r.offline) { setErreur("Hors ligne — connexion requise pour s'identifier."); return; }
    const data = r.data as { error?: string; code?: string; prenom?: string };
    if (!r.ok) {
      if (data.code === "CHALLENGE_EXPIRED") { onBadgeExpire(); return; }
      setErreur(data.error || "PIN incorrect. Réessayez."); setPin(""); return;
    }
    onConnecte(data.prenom || prenom);
  }

  const pinComplet = pin.length === 6;

  return (
    <form onSubmit={connecter} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: "14px" }}>
      <div style={{ width: "160px", margin: "0 auto 4px", borderRadius: "16px", overflow: "hidden" }}>
        <Image src="/illustrations/checkin-pin-connexion-hero.png" alt="" width={1536} height={1024} sizes="160px" style={{ width: "100%", height: "auto", display: "block" }} />
      </div>
      <div style={{ color: T1, fontSize: "18px", fontWeight: 800, textAlign: "center" }}>Bonjour, {prenom || "agent"}</div>
      <div style={{ color: T2, fontSize: "12.5px", textAlign: "center", marginBottom: "8px" }}>Saisissez votre PIN pour terminer la connexion.</div>
      <input
        value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="PIN à 6 chiffres" type="password"
        inputMode="numeric" autoComplete="current-password" maxLength={6} autoFocus style={champStyle}
      />
      {pin.length > 0 && !pinComplet && (
        <div style={{ color: T2, fontSize: "11.5px", textAlign: "center", marginTop: "-6px" }}>
          Il manque encore {6 - pin.length} chiffre{6 - pin.length > 1 ? "s" : ""}
        </div>
      )}
      {erreur && <ErreurBanner message={erreur} onFermer={() => setErreur("")} />}
      <button type="submit" disabled={chargement || !pinComplet} style={btnPrimary}>
        {chargement ? <YelenLoader size={16} color="#111" /> : "Se connecter"}
      </button>
      <button type="button" onClick={onBadgeExpire} style={{ background: "none", border: "none", color: T2, fontSize: "12px", cursor: "pointer" }}>
        Ce n&apos;est pas moi / rescanner un badge
      </button>
    </form>
  );
}

function EcranVerrouille({ prenom, onDeverrouille, onSessionExpiree }: { prenom: string; onDeverrouille: () => void; onSessionExpiree: () => void }) {
  const [pin, setPin] = useState("");
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);

  async function deverrouiller(e: FormEvent) {
    e.preventDefault();
    setErreur("");
    setChargement(true);
    const r = await appelJson("/api/checkin/unlock", { method: "POST", body: JSON.stringify({ pin }) });
    setChargement(false);
    if (r.offline) { setErreur("Hors ligne — connexion requise."); return; }
    if (!r.ok) {
      const data = r.data as { error?: string; code?: string };
      if (r.status === 401 && data.code === "SESSION_EXPIRED") { onSessionExpiree(); return; }
      if (r.status === 429) { onSessionExpiree(); return; }
      setErreur(data.error || "PIN incorrect. Réessayez."); setPin(""); return;
    }
    onDeverrouille();
  }

  const pinComplet = pin.length === 6;

  return (
    <form onSubmit={deverrouiller} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: "14px" }}>
      <div style={{ width: 72, height: 72, margin: "0 auto 8px" }}>
        <Image src="/illustrations/checkin-verrouille-icon.png" alt="" width={1254} height={1254} sizes="72px" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
      <div style={{ color: T1, fontSize: "18px", fontWeight: 800, textAlign: "center" }}>Session verrouillée</div>
      <div style={{ color: T2, fontSize: "12.5px", textAlign: "center", marginBottom: "8px" }}>Ressaisissez votre PIN, {prenom || "bonjour"}.</div>
      <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="PIN à 6 chiffres" type="password" inputMode="numeric" maxLength={6} autoFocus style={champStyle} />
      {pin.length > 0 && !pinComplet && (
        <div style={{ color: T2, fontSize: "11.5px", textAlign: "center", marginTop: "-6px" }}>
          Il manque encore {6 - pin.length} chiffre{6 - pin.length > 1 ? "s" : ""}
        </div>
      )}
      {erreur && <ErreurBanner message={erreur} onFermer={() => setErreur("")} />}
      <button type="submit" disabled={chargement || !pinComplet} style={btnPrimary}>
        {chargement ? <YelenLoader size={16} color="#111" /> : "Déverrouiller"}
      </button>
      <div style={{ color: T2, fontSize: "11.5px", textAlign: "center", marginTop: "8px" }}>© 2026 YELEN</div>
    </form>
  );
}

function EcranScanner({
  prenom, historique, onResultat, onEchecSession,
}: {
  prenom: string; historique: Historique[];
  onResultat: (rdv: RdvMinimal) => void;
  onEchecSession: (status: number, data: Record<string, unknown>) => boolean;
}) {
  const [camPhase, setCamPhase] = useState<"avant" | "demarrage" | "actif" | "refuse">("avant");
  const [codeManuelOuvert, setCodeManuelOuvert] = useState(false);
  const [codeManuel, setCodeManuel] = useState("");
  const [erreurScan, setErreurScan] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [disclosureOuverte, setDisclosureOuverte] = useState(false);
  const [entreeSelectionnee, setEntreeSelectionnee] = useState<Historique | null>(null);
  const html5QrRef = useRef<Html5Qrcode | null>(null);

  function arreterCameraSiActive(html5QrCode: Html5Qrcode | null) {
    if (!html5QrCode?.isScanning) return;
    try { html5QrCode.stop().catch(() => {}); } catch {}
  }

  const traiterEntree = useCallback(async (body: Record<string, unknown>) => {
    setEnCours(true);
    setErreurScan("");
    const r = await appelJson("/api/checkin/scan", { method: "POST", body: JSON.stringify(body) });
    setEnCours(false);
    if (r.offline) { setErreurScan("Hors ligne — connexion requise pour confirmer une présence."); return; }
    const data = r.data as Record<string, unknown>;
    if (!r.ok) {
      if (onEchecSession(r.status, data)) return;
      setErreurScan((data.error as string) || "Une erreur est survenue lors de la vérification. Réessayez.");
      return;
    }
    onResultat((data.rdv as RdvMinimal));
  }, [onEchecSession, onResultat]);

  async function demarrerCamera() {
    setCamPhase("demarrage");
    try {
      const html5QrCode = new Html5Qrcode("qr-reader-checkin");
      html5QrRef.current = html5QrCode;
      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText: string) => {
          arreterCameraSiActive(html5QrCode);
          setCamPhase("avant");
          void traiterEntree({ qr_payload: decodedText });
        },
        () => {},
      );
      setCamPhase("actif");
    } catch {
      setCamPhase("refuse");
    }
  }

  function demanderCamera() {
    if (camDisclosureVue()) { void demarrerCamera(); return; }
    setDisclosureOuverte(true);
  }

  useEffect(() => () => arreterCameraSiActive(html5QrRef.current), []);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <div style={{ color: T1, fontSize: "16px", fontWeight: 800, marginBottom: "2px" }}>Bonjour, {prenom || "agent"}</div>
      <div style={{ color: T2, fontSize: "12px", marginBottom: "16px" }}>Scannez le QR de rendez-vous du client.</div>

      <div style={{ position: "relative", display: (camPhase === "actif" || camPhase === "demarrage") ? "block" : "none" }}>
        <div id="qr-reader-checkin" style={{ borderRadius: "16px", overflow: "hidden", backgroundColor: BG2, minHeight: "280px" }} />
        {camPhase === "demarrage" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <YelenLoader size={36} label="Ouverture de la caméra…" labelColor={T2} />
          </div>
        )}
      </div>

      {camPhase === "avant" && (
        <div style={{ textAlign: "center", padding: "36px 12px", background: BG2, borderRadius: "16px", border: `1px solid ${BORDER}` }}>
          <div style={{ width: "72px", height: "72px", margin: "0 auto 16px" }}>
            <Image src="/illustrations/checkin-scan-client-icon.png" alt="" width={1254} height={1254} sizes="72px" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <div style={{ color: T1, fontSize: "15px", fontWeight: 800, marginBottom: "6px" }}>Scanner le QR du client</div>
          <button onClick={demanderCamera} style={btnPrimary}>Activer la caméra</button>
        </div>
      )}
      {camPhase === "refuse" && (
        <div style={{ textAlign: "center", padding: "28px 12px", background: BG2, borderRadius: "16px", border: `1px solid ${BORDER}` }}>
          <div style={{ color: T1, fontSize: "15px", fontWeight: 800, marginBottom: "6px" }}>Caméra indisponible</div>
          <div style={{ color: T2, fontSize: "12.5px", marginBottom: "16px" }}>Autorisez la caméra, ou utilisez le code manuel ci-dessous.</div>
          <button onClick={demanderCamera} style={btnGhost}>Réessayer</button>
        </div>
      )}

      {disclosureOuverte && (
        <CameraDisclosureModal
          onContinuer={() => { marquerCamDisclosureVue(); setDisclosureOuverte(false); void demarrerCamera(); }}
          onAnnuler={() => setDisclosureOuverte(false)}
        />
      )}

      {erreurScan && !codeManuelOuvert && (
        <div style={{ marginTop: "12px" }}>
          <ErreurBanner message={erreurScan} onFermer={() => setErreurScan("")} />
        </div>
      )}

      <div style={{ marginTop: "16px", textAlign: "center" }}>
        {!codeManuelOuvert ? (
          <button onClick={() => setCodeManuelOuvert(true)} style={{ background: "none", border: "none", color: T2, fontSize: "12px", textDecoration: "underline", cursor: "pointer" }}>
            Impossible de scanner ? Saisir le code YELEN
          </button>
        ) : (
          <div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
              <input
                value={codeManuel}
                onChange={(e) => { setCodeManuel(e.target.value.toUpperCase()); if (erreurScan) setErreurScan(""); }}
                placeholder="Code YELEN"
                maxLength={8}
                style={{ ...champStyle, textAlign: "center", letterSpacing: "2px", flex: 1, border: erreurScan ? `1.5px solid ${RED}` : champStyle.border }}
              />
              <button
                disabled={enCours || codeManuel.length < 4}
                onClick={() => traiterEntree({ code_manuel: codeManuel })}
                style={{ ...btnPrimary, width: "auto", padding: "0 20px" }}
              >
                {enCours ? <YelenLoader size={16} color="#111" /> : "Valider"}
              </button>
            </div>
            {erreurScan && (
              <div style={{ marginTop: "8px" }}>
                <ErreurBanner message={erreurScan} onFermer={() => setErreurScan("")} />
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: "auto", paddingTop: "20px", borderTop: `1px solid ${BORDER}` }}>
        <div style={{ color: T1, fontSize: "13px", fontWeight: 800 }}>Historique des scans</div>
        <div style={{ color: T2, fontSize: "10.5px", marginBottom: "10px" }}>Depuis l&apos;ouverture de votre session</div>

        {historique.length === 0 ? (
          <div style={{ textAlign: "center", padding: "22px 14px", background: BG2, borderRadius: "14px", border: `1px dashed ${BORDER}` }}>
            <div style={{ color: T1, fontSize: "13px", fontWeight: 700, marginBottom: "4px" }}>Aucun scan pour l&apos;instant</div>
            <div style={{ color: T2, fontSize: "11.5px", lineHeight: 1.5 }}>Les clients que vous validez apparaîtront ici, dans l&apos;ordre.</div>
          </div>
        ) : (
          <div>
            {historique.slice(0, 5).map((h) => (
              <button
                key={h.id + h.heure_scan}
                onClick={() => setEntreeSelectionnee(h)}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "10px 2px", background: "none", border: "none", borderBottom: `1px solid ${BORDER}`, cursor: "pointer", textAlign: "left" }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: T1, fontSize: "12.5px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.citoyen_affichage}</div>
                  <div style={{ color: T2, fontSize: "11px" }}>{h.service || "RDV général"}</div>
                </div>
                <span style={{ color: T2, fontSize: "11px", flexShrink: 0 }}>{h.heure_scan}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {entreeSelectionnee && (
        <HistoriqueSheet entree={entreeSelectionnee} onFermer={() => setEntreeSelectionnee(null)} />
      )}
    </div>
  );
}

// Sheet Yelen — détail d'un scan de la session (16/09/2026). Volontairement
// limité aux champs déjà connus côté client au moment du scan (aucune
// requête serveur ici, CheckInApp reste autonome du dashboard) — l'historique
// complet et durable existe déjà côté dashboard institution (onglet "Scanner
// QR"), d'où le renvoi explicite en bas de la sheet.
function HistoriqueSheet({ entree, onFermer }: { entree: Historique; onFermer: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={onFermer} style={{ position: "absolute", inset: 0, background: "rgba(28,20,0,0.45)" }} />
      <div style={{ position: "relative", width: "100%", maxWidth: "480px", background: BG, borderRadius: "20px 20px 0 0", padding: "14px 22px calc(20px + env(safe-area-inset-bottom))", boxShadow: "0 -8px 30px rgba(28,20,0,0.2)" }}>
        <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: BORDER, margin: "0 auto 18px" }} />

        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
          <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "rgba(47,191,113,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: T1, fontSize: "16px", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entree.citoyen_affichage}</div>
            <div style={{ color: GREEN, fontSize: "12px", fontWeight: 700 }}>Présence confirmée</div>
          </div>
        </div>

        <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: "14px", padding: "14px 16px", marginBottom: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
            <span style={{ color: T2 }}>Service</span>
            <span style={{ color: T1, fontWeight: 700 }}>{entree.service || "RDV général"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
            <span style={{ color: T2 }}>Rendez-vous prévu à</span>
            <span style={{ color: T1, fontWeight: 700 }}>{entree.heure_rdv}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
            <span style={{ color: T2 }}>Présence validée à</span>
            <span style={{ color: T1, fontWeight: 700 }}>{entree.heure_scan}</span>
          </div>
        </div>

        <div style={{ color: T2, fontSize: "12px", lineHeight: 1.5, textAlign: "center", marginBottom: "18px" }}>
          Retrouvez plus d&apos;informations depuis votre espace dashboard.
        </div>

        <button onClick={onFermer} style={{ width: "100%", minHeight: "48px", padding: "13px", borderRadius: "12px", border: `1px solid ${BORDER}`, background: "none", color: T1, fontWeight: 700, fontSize: "14px", cursor: "pointer" }}>Fermer</button>
      </div>
    </div>
  );
}

function EcranResultat({
  rdv, onConfirme, onAnnuler, onEchecSession, setErreur,
}: {
  rdv: RdvMinimal; onConfirme: () => void; onAnnuler: () => void;
  onEchecSession: (status: number, data: Record<string, unknown>) => boolean;
  setErreur: (s: string) => void;
}) {
  const [enCours, setEnCours] = useState<"present" | "absent" | null>(null);
  const [absentModalOuverte, setAbsentModalOuverte] = useState(false);
  const [motifAbsent, setMotifAbsent] = useState("");

  async function agir(action: "present" | "absent", motif?: string) {
    setEnCours(action);
    setErreur("");
    const r = await appelJson("/api/checkin/confirm", { method: "PUT", body: JSON.stringify({ rdv_id: rdv.id, action, ...(motif ? { motif } : {}) }) });
    setEnCours(null);
    if (r.offline) { setErreur("Hors ligne — connexion requise pour confirmer une présence."); return; }
    const data = r.data as Record<string, unknown>;
    if (!r.ok) {
      if (onEchecSession(r.status, data)) return;
      setErreur((data.error as string) || "La confirmation a échoué. Réessayez.");
      return;
    }
    if (action === "present") onConfirme(); else onAnnuler();
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <div style={{ background: "rgba(47,191,113,0.12)", border: `1px solid ${GREEN}40`, borderRadius: "12px", padding: "10px 14px", marginBottom: "16px", color: GREEN, fontSize: "12px", fontWeight: 800 }}>
        Rendez-vous trouvé
      </div>
      <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: "16px", padding: "20px", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "13px", background: `${OR}25`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: 800, color: OR }}>
            {rdv.citoyen_affichage.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ color: T1, fontSize: "16px", fontWeight: 800 }}>{rdv.citoyen_affichage}</div>
            <div style={{ color: T2, fontSize: "12px" }}>{rdv.service || "RDV général"} · {rdv.heure_rdv}</div>
          </div>
        </div>
      </div>
      <button onClick={() => agir("present")} disabled={enCours !== null} style={{ ...btnPrimary, background: GREEN, color: "#fff", marginBottom: "10px" }}>
        {enCours === "present" ? <YelenLoader size={16} color="#fff" /> : "Confirmer la présence"}
      </button>
      <button onClick={() => setAbsentModalOuverte(true)} disabled={enCours !== null} style={{ ...btnGhost, width: "100%", padding: "12px", marginBottom: "10px" }}>
        {enCours === "absent" ? "…" : "Signaler un problème / Absent"}
      </button>
      <button onClick={onAnnuler} disabled={enCours !== null} style={{ background: "none", border: "none", color: T2, fontSize: "12px", cursor: "pointer" }}>
        Annuler, revenir au scanner
      </button>

      {absentModalOuverte && (
        <AbsentMotifModal
          motif={motifAbsent}
          setMotif={setMotifAbsent}
          loading={enCours === "absent"}
          onAnnuler={() => { setAbsentModalOuverte(false); setMotifAbsent(""); }}
          onConfirmer={() => { const m = motifAbsent.trim(); setAbsentModalOuverte(false); setMotifAbsent(""); void agir("absent", m); }}
        />
      )}
    </div>
  );
}

// Confirmation "Absent" — motif obligatoire (≥5 caractères), même seuil que
// MotifModal côté dashboard (ValiderRdvTab.tsx) : ce constat alimente le
// même trigger d'escalade de restriction citoyen (voir
// lib/qrValidation.ts::confirmerPresenceRdv) — jamais un simple tap sans
// confirmation ni trace (trou comblé le 14/09/2026). Composant local plutôt
// que réutilisé : CheckInApp reste volontairement autonome du dashboard
// (voir en-tête de fichier).
function AbsentMotifModal({ motif, setMotif, loading, onAnnuler, onConfirmer }: {
  motif: string; setMotif: (v: string) => void; loading: boolean; onAnnuler: () => void; onConfirmer: () => void;
}) {
  const bloque = loading || motif.trim().length < 5;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div onClick={onAnnuler} style={{ position: "absolute", inset: 0, background: "rgba(28,20,0,0.45)" }} />
      <div style={{ position: "relative", width: "100%", maxWidth: "360px", background: BG, borderRadius: "18px", padding: "22px", boxShadow: "0 12px 40px rgba(28,20,0,0.25)" }}>
        <div style={{ color: T1, fontSize: "16px", fontWeight: 800, marginBottom: "8px" }}>Marquer ce citoyen absent ?</div>
        <p style={{ color: T2, fontSize: "12.5px", lineHeight: 1.5, marginBottom: "14px" }}>
          Cette action est visible du citoyen et compte dans son historique de présence.
        </p>
        <label style={{ color: T2, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "6px" }}>Motif (obligatoire)</label>
        <textarea
          value={motif}
          onChange={e => setMotif(e.target.value)}
          rows={3}
          placeholder="Ex. ne s'est pas présenté au comptoir…"
          style={{ width: "100%", background: BG2, border: `1.5px solid ${BORDER}`, borderRadius: "12px", padding: "10px 12px", fontSize: "13px", color: T1, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: "10px", marginTop: "16px" }}>
          <button onClick={onAnnuler} disabled={loading} style={{ minHeight: "48px", padding: "13px", borderRadius: "12px", border: `1px solid ${BORDER}`, background: "none", color: T1, fontWeight: 700, fontSize: "14px", cursor: "pointer" }}>Annuler</button>
          <button onClick={onConfirmer} disabled={bloque} style={{ minHeight: "48px", padding: "13px", borderRadius: "12px", border: "none", background: bloque ? BORDER : RED, color: "#fff", fontWeight: 800, fontSize: "14px", cursor: bloque ? "not-allowed" : "pointer" }}>
            {loading ? "…" : "Confirmer l'absence"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EcranConfirmation({ onSuivant }: { onSuivant: () => void }) {
  useEffect(() => {
    const t = setTimeout(onSuivant, 2000);
    return () => clearTimeout(t);
  }, [onSuivant]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(47,191,113,0.15)", border: `2px solid ${GREEN}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
      </div>
      <div style={{ color: GREEN, fontSize: "16px", fontWeight: 800, marginBottom: "20px" }}>Présence confirmée</div>
      <button onClick={onSuivant} style={btnPrimary}>Scanner le client suivant</button>
    </div>
  );
}

const champStyle: CSSProperties = {
  background: BG2, border: `1px solid ${BORDER}`, borderRadius: "12px", padding: "14px 16px",
  color: T1, fontSize: "15px", width: "100%", boxSizing: "border-box",
};

const btnPrimary: CSSProperties = {
  background: OR, color: "#111", border: "none", borderRadius: "12px", padding: "14px",
  fontSize: "14px", fontWeight: 800, cursor: "pointer", width: "100%",
  display: "flex", alignItems: "center", justifyContent: "center",
};
