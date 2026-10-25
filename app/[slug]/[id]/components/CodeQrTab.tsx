"use client";

// Onglet Mon code QR — remplace l'ancienne route séparée app/institution/codeqr
// (qui listait TOUTES les institutions, un outil de navigation multi-institutions
// hors sujet dans un dashboard scopé à une seule institution). Génération du QR
// déléguée à lib/qrBrand.ts::generateBrandedQR — source unique partagée avec le
// QR citoyen (components/YelenIdQrModal.tsx), retour Bryan 29/08/2026 : les
// deux doivent rendre exactement le même badge, jamais deux logiques
// divergentes pour la même marque.
// Refonte visuelle 24/10/2026 (frontend uniquement) : 2 colonnes desktop (badge
// sticky + actions), 1 colonne mobile. Données, URL encodée et API inchangées.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import { useTheme } from "@/components/ThemeProvider";
import { T, toCardTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { APP_URL } from "@/lib/config";
import { construireLienPartageInstitution } from "@/lib/institutionSlug";
import { generateBrandedQR } from "@/lib/qrBrand";
import { HelpCenterGuide } from "./HelpCenterGuide";

// ?source=qr — repéré par la fiche institution pour mesurer les réservations
// qui découlent réellement d'un scan (retour Bryan 25/07/2026), sans changer
// la destination : le QR continue de mener à la fiche, pas directement à la
// réservation, "important de voir les infos avant réservation".
// Base publique : APP_URL (NEXT_PUBLIC_APP_URL) sauf si elle pointe vers une
// adresse locale/réseau privé (localhost, 192.168.x.x…), inutilisable une fois
// le QR imprimé ou partagé — repli sur le domaine de production.
const URL_PRODUCTION = "https://yelen224.netlify.app";
const BASE_PUBLIQUE = /^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0)/i.test(APP_URL) ? URL_PRODUCTION : APP_URL;

function institutionQrUrl(instSlug: string, instId: string): string {
  return `${BASE_PUBLIQUE}/institution/${construireLienPartageInstitution(instSlug, instId)}?source=qr`;
}

type ActionKey = "png" | "svg" | "copy" | "share";

function Icon({ children, size = 16, stroke = "currentColor", sw = 2 }: { children: ReactNode; size?: number; stroke?: string; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const ICONS = {
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>,
  print: <><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></>,
  copy: <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
  check: <polyline points="20 6 9 17 4 12"/>,
  open: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>,
  share: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></>,
  mail: <><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22,6 12,13 2,6"/></>,
  chat: <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 20l1.1-4.9A8.4 8.4 0 0 1 3 11.5 8.5 8.5 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z"/>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></>,
  trend: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
  desk: <><rect x="2" y="7" width="20" height="4" rx="1"/><path d="M4 11v9M20 11v9M8 11v4h8v-4"/></>,
  store: <><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 12v8h14v-8"/></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/></>,
  globe: <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>,
} as const;

const CONSEILS: { icon: keyof typeof ICONS; titre: string; texte: string }[] = [
  { icon: "desk", titre: "Accueil et guichet", texte: "Posez-le là où les clients attendent : ils réservent en 10 secondes." },
  { icon: "store", titre: "Vitrine", texte: "Collé sur la porte ou la vitrine, il est visible même fermé." },
  { icon: "file", titre: "Reçus et courriers", texte: "Ajoutez-le sur vos reçus, factures et courriers imprimés." },
  { icon: "globe", titre: "Site web et réseaux", texte: "Partagez le lien ou l'image sur vos réseaux sociaux." },
];

function telecharger(href: string, nom: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = nom;
  a.click();
}

export function CodeQrTab({ instId, instName, instSlug, onToast }: { instId: string; instName: string; instSlug: string; onToast?: (msg: string, color?: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme];
  const ui = toUiTokens(C);
  const [qr, setQr] = useState("");
  const [loading, setLoading] = useState(true);
  const [erreurQr, setErreurQr] = useState(false);
  const [done, setDone] = useState<ActionKey | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Preuve de valeur du QR (retour Bryan 25/07/2026) — null tant que non
  // chargé, pour ne jamais afficher "0" par défaut avant d'avoir la vraie
  // réponse (zéro donnée inventée le temps du chargement).
  const [qrCount, setQrCount] = useState<number | null>(null);

  const urlAbsente = !instSlug && !instId;
  const url = urlAbsente ? "" : institutionQrUrl(instSlug, instId);
  const urlAffichee = url.replace(/^https?:\/\//, "");
  const nomFichier = `QR-Yelen-${instName.replace(/\s+/g, "-")}`;
  const peutPartager = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const generate = useCallback(async () => {
    if (urlAbsente) { setLoading(false); return; }
    setLoading(true);
    setErreurQr(false);
    try {
      setQr(await generateBrandedQR(institutionQrUrl(instSlug, instId), 600));
    } catch {
      setErreurQr(true);
    }
    setLoading(false);
  }, [instSlug, instId, urlAbsente]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/institution/qr-provenance");
        if (res.ok) { const j = await res.json(); setQrCount(typeof j.count === "number" ? j.count : 0); }
      } catch {}
    })();
  }, [instId]);

  useEffect(() => { generate(); }, [generate]);
  useEffect(() => () => { if (doneTimer.current) clearTimeout(doneTimer.current); }, []);

  function marquerFait(k: ActionKey) {
    setDone(k);
    if (doneTimer.current) clearTimeout(doneTimer.current);
    doneTimer.current = setTimeout(() => setDone(null), 2000);
  }

  async function downloadPNG() {
    if (!url) return;
    try {
      // 1200px : même contenu que l'aperçu, résolution adaptée à l'impression.
      telecharger(await generateBrandedQR(url, 1200), `${nomFichier}.png`);
      marquerFait("png");
      onToast?.("QR téléchargé (PNG HD)");
    } catch {
      onToast?.("Impossible de générer le PNG.", C.red);
    }
  }

  async function downloadSVG() {
    if (!url) return;
    try {
      const svg = await QRCode.toString(url, { type: "svg", margin: 4, errorCorrectionLevel: "H", color: { dark: "#080812", light: "#ffffff" } });
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const href = URL.createObjectURL(blob);
      telecharger(href, `${nomFichier}.svg`);
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      marquerFait("svg");
      onToast?.("QR téléchargé (SVG)");
    } catch {
      onToast?.("Impossible de générer le SVG.", C.red);
    }
  }

  async function copyURL() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      marquerFait("copy");
      onToast?.("Lien copié");
    } catch {
      onToast?.("Copie impossible, sélectionnez le lien manuellement.", C.red);
    }
  }

  async function partager() {
    if (!url) return;
    try {
      await navigator.share({ title: instName, text: `Réservez chez ${instName} sur Yelen224`, url });
      marquerFait("share");
    } catch {
      // Annulation par l'utilisateur : aucun message.
    }
  }

  const texteMessage = encodeURIComponent(`Réservez chez ${instName} sur Yelen224 : ${url}`);
  const lienWhatsApp = `https://wa.me/?text=${texteMessage}`;
  const lienEmail = `mailto:?subject=${encodeURIComponent(`${instName} sur Yelen224`)}&body=${texteMessage}`;

  const tokensCarte = toCardTokens(C);
  const bordure = `1px solid ${C.border2}`;
  const labelStyle = { color: C.t2, fontSize: "13px", fontWeight: 700, marginBottom: "10px" };
  const lienSecondaire = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "7px", minHeight: "40px", padding: "0 16px", borderRadius: "10px", border: bordure, backgroundColor: C.bgCard2, color: C.t1, fontSize: "13px", fontWeight: 700, textDecoration: "none", boxSizing: "border-box" as const };

  return (
    <div className="cq-page" style={{ padding: "16px" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <div className="cq-grid">
          {/* ── Colonne gauche : badge QR (toujours noir sur blanc) ── */}
          <div className="cq-left">
            <div id="print-area-codeqr" className="cq-badge" style={{ backgroundColor: "#fff", border: "1px solid rgba(10,10,18,0.10)", borderRadius: "16px", boxShadow: "0 4px 20px rgba(10,10,18,0.08)", padding: "14px 16px 16px", display: "flex", flexDirection: "column", alignItems: "center", color: "#0A0A12" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "10px" }}>
                <Icon size={14} stroke="#47475C">{ICONS.shield}</Icon>
                YELEN224 · Identité vérifiée
              </div>
              <div className="cq-qr" style={{ width: "100%", aspectRatio: "1/1", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {qr ? (
                  // IMG-EXCEPTION: reason=data URL base64 générée localement (QRCode.toDataURL), non fetchable par l'optimiseur next/image | reviewed=2026-08-08
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr} alt={`QR code de ${instName} : scannez-le pour ouvrir son profil Yelen224`} style={{ width: "100%", height: "100%", display: "block" }}/>
                ) : urlAbsente || erreurQr ? (
                  <div role="alert" style={{ textAlign: "center", padding: "16px", fontSize: "13px", color: "#47475C", lineHeight: 1.5 }}>
                    {urlAbsente ? "Le lien public de votre établissement est introuvable." : "Impossible de générer le QR."}
                    {!urlAbsente && <div style={{ marginTop: "10px" }}><Button tokens={ui} size="sm" variant="secondary" onClick={generate}>Réessayer</Button></div>}
                  </div>
                ) : (
                  <div className="cq-skel" role="status" aria-label="Génération du QR en cours" style={{ width: "100%", height: "100%", borderRadius: "8px" }}/>
                )}
              </div>
              <div className="cq-badge-nom" style={{ fontSize: "16px", fontWeight: 700, textAlign: "center", marginTop: "10px", letterSpacing: "-0.2px" }}>{instName}</div>
              <div style={{ color: "#6B6B7B", fontSize: "12px", marginTop: "2px", textAlign: "center", wordBreak: "break-all" }}>{urlAffichee.split("?")[0]}</div>
            </div>
          </div>

          {/* ── Colonne droite : actions ── */}
          <div className="cq-right" style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 }}>
            <div>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
                <h1 style={{ color: C.t1, fontSize: "24px", fontWeight: 700, letterSpacing: "-0.5px", margin: 0 }}>Mon code QR</h1>
                <HelpCenterGuide tab="codeqr" />
              </div>
              <p style={{ color: C.t2, fontSize: "14px", margin: "6px 0 0", lineHeight: 1.5 }}>
                Vos clients le scannent pour ouvrir votre profil Yelen224 et réserver.
              </p>
            </div>

            {/* Lien public */}
            <Card tokens={tokensCarte} padding="16px" style={{ border: bordure }}>
              <div style={labelStyle}>Lien public</div>
              <div className="cq-row">
                <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 6px 0 12px", borderRadius: "10px", border: bordure, backgroundColor: C.bgCard2 }}>
                  <input readOnly value={url} aria-label="Lien public de votre établissement" onFocus={e => e.currentTarget.select()}
                    style={{ flex: 1, minWidth: 0, height: "100%", fontSize: "13px", color: C.t1, textOverflow: "ellipsis" }}/>
                  <button type="button" onClick={copyURL} disabled={!url} aria-label={done === "copy" ? "Lien copié" : "Copier le lien"}
                    className="cq-copy" data-done={done === "copy"}
                    style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 12px", borderRadius: "8px", border: "none", cursor: url ? "pointer" : "not-allowed", fontSize: "12px", fontWeight: 700, fontFamily: "inherit", backgroundColor: done === "copy" ? C.greenL : C.bgCard, color: done === "copy" ? C.green : C.t1 }}>
                    <Icon size={14}>{done === "copy" ? ICONS.check : ICONS.copy}</Icon>
                    {done === "copy" ? "Copié ✓" : "Copier"}
                  </button>
                </div>
                <a className="cq-link yelen-focus-ring" href={url || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!url}
                  style={{ ...lienSecondaire, opacity: url ? 1 : 0.5, pointerEvents: url ? "auto" : "none" }}>
                  <Icon size={15}>{ICONS.open}</Icon>Ouvrir
                </a>
              </div>
              <span className="cq-sr" role="status" aria-live="polite">{done === "copy" ? "Lien copié dans le presse-papiers" : ""}</span>
            </Card>

            {/* Télécharger */}
            <Card tokens={tokensCarte} padding="16px" style={{ border: bordure }}>
              <div style={labelStyle}>Télécharger</div>
              <Button tokens={ui} size="md" variant="primary" fullWidth className="tap cq-btn" disabled={!qr}
                icon={<Icon size={16}>{done === "png" ? ICONS.check : ICONS.download}</Icon>}
                onClick={downloadPNG}>{done === "png" ? "QR téléchargé" : "Télécharger le QR (PNG HD)"}</Button>
              <div className="cq-row" style={{ marginTop: "8px" }}>
                <Button tokens={ui} size="md" variant="secondary" fullWidth className="tap cq-btn" disabled={!qr}
                  icon={<Icon size={15}>{done === "svg" ? ICONS.check : ICONS.image}</Icon>}
                  onClick={downloadSVG}>{done === "svg" ? "SVG téléchargé" : "Télécharger en SVG"}</Button>
                <Button tokens={ui} size="md" variant="secondary" fullWidth className="tap cq-btn" disabled={!qr}
                  icon={<Icon size={15}>{ICONS.print}</Icon>}
                  onClick={() => window.print()}>Imprimer</Button>
              </div>
            </Card>

            {/* Partager */}
            <Card tokens={tokensCarte} padding="16px" style={{ border: bordure }}>
              <div style={labelStyle}>Partager</div>
              <div className="cq-row" style={{ flexWrap: "wrap" }}>
                {peutPartager && (
                  <Button tokens={ui} size="md" variant="secondary" className="tap cq-btn" disabled={!url}
                    icon={<Icon size={15}>{done === "share" ? ICONS.check : ICONS.share}</Icon>}
                    onClick={partager}>Partager</Button>
                )}
                <a className="cq-link yelen-focus-ring" href={url ? lienWhatsApp : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!url} style={{ ...lienSecondaire, pointerEvents: url ? "auto" : "none", opacity: url ? 1 : 0.5 }}>
                  <Icon size={15}>{ICONS.chat}</Icon>WhatsApp
                </a>
                <a className="cq-link yelen-focus-ring" href={url ? lienEmail : undefined} aria-disabled={!url} style={{ ...lienSecondaire, pointerEvents: url ? "auto" : "none", opacity: url ? 1 : 0.5 }}>
                  <Icon size={15}>{ICONS.mail}</Icon>E-mail
                </a>
              </div>
            </Card>

            {/* Preuve de valeur — combien de réservations viennent réellement de
                ce QR/lien (retour Bryan 25/07/2026). Masqué tant que le
                chargement n'a pas répondu. */}
            {qrCount !== null && (
              <Card tokens={tokensCarte} padding="12px 16px" style={{ border: bordure, display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: `${C.gold}15`, border: `1px solid ${C.gold}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: C.gold }}>
                  <Icon size={17}>{ICONS.trend}</Icon>
                </div>
                {qrCount === 0 ? (
                  <div style={{ color: C.t2, fontSize: "13px", lineHeight: 1.5 }}>
                    Aucune réservation via le QR pour l&apos;instant. Affichez-le à l&apos;accueil pour commencer.
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "24px", fontWeight: 600, color: C.t1, lineHeight: 1 }}>{qrCount}</span>
                    <span style={{ color: C.t2, fontSize: "13px" }}>{qrCount === 1 ? "réservation obtenue" : "réservations obtenues"} grâce à ce QR / ce lien</span>
                  </div>
                )}
              </Card>
            )}

            {/* Où l'afficher */}
            <Card tokens={tokensCarte} padding="16px" style={{ border: bordure }}>
              <div style={labelStyle}>Où l&apos;afficher</div>
              <ul className="cq-tips" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {CONSEILS.map(c => (
                  <li key={c.titre} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                    <div style={{ width: "32px", height: "32px", borderRadius: "9px", backgroundColor: C.bgCard2, border: bordure, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: C.t2 }}>
                      <Icon size={16}>{ICONS[c.icon]}</Icon>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: C.t1, fontSize: "13px", fontWeight: 600 }}>{c.titre}</div>
                      <div style={{ color: C.t2, fontSize: "13px", lineHeight: 1.5, marginTop: "2px" }}>{c.texte}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </div>

      <style>{`
        .cq-page{animation:cqIn 0.25s ease}
        @keyframes cqIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        @keyframes cqPulse{0%,100%{opacity:1}50%{opacity:0.45}}
        .cq-skel{background:#ECECF1;animation:cqPulse 1.2s ease-in-out infinite}
        .cq-grid{display:grid;grid-template-columns:1fr;gap:20px}
        .cq-left{width:100%;max-width:360px;margin:0 auto}
        .cq-qr{width:100%;max-width:280px}
        .cq-row{display:flex;gap:8px;flex-direction:column}
        .cq-row > *{width:100%}
        .cq-tips{display:grid;grid-template-columns:1fr;gap:14px}
        .cq-btn,.cq-link,.cq-copy{min-height:44px}
        .cq-link,.cq-copy,.cq-btn{transition:background-color 0.15s ease,color 0.15s ease,transform 0.1s ease}
        .cq-link:hover,.cq-btn:not(:disabled):hover{filter:brightness(1.06)}
        .cq-link:active,.cq-btn:not(:disabled):active,.cq-copy:active{transform:scale(0.98)}
        .cq-copy:focus-visible{outline:2px solid ${C.gold};outline-offset:2px}
        .cq-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
        @media (min-width:640px){
          .cq-row{flex-direction:row;flex-wrap:wrap}
          .cq-row > *{width:auto;flex:1 1 0}
          .cq-tips{grid-template-columns:1fr 1fr}
        }
        @media (min-width:1024px){
          .cq-page{padding:24px 16px !important}
          .cq-grid{grid-template-columns:360px minmax(0,1fr);gap:28px;align-items:start}
          .cq-left{position:sticky;top:16px;margin:0}
          .cq-qr{max-width:236px}
          .cq-btn,.cq-link,.cq-copy{min-height:40px}
        }
        @media (prefers-reduced-motion:reduce){
          .cq-page,.cq-skel{animation:none}
          .cq-link,.cq-copy,.cq-btn{transition:none}
          .cq-link:active,.cq-btn:active,.cq-copy:active{transform:none}
        }
        @media print{
          body *{visibility:hidden !important}
          #print-area-codeqr,#print-area-codeqr *{visibility:visible !important}
          #print-area-codeqr{position:fixed !important;inset:0;margin:auto;width:150mm !important;height:fit-content !important;box-shadow:none !important;border:2px solid #0A0A12 !important;padding:16mm !important;background:#fff !important}
          #print-area-codeqr .cq-qr{max-width:none !important}
          #print-area-codeqr .cq-badge-nom{font-size:22px !important}
        }
      `}</style>
    </div>
  );
}
