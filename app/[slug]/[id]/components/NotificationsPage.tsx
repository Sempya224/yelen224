"use client";

// Écran « Notifications » (liste complète + volet de détail), 22/10/2026.
// Présentation uniquement : les notifications, les non lues capturées à
// l'ouverture et la correspondance RDV -> citoyen viennent de layout.tsx (aucune
// requête ici). Libellés, catégories et regroupement : lib/notificationsPresentation.ts,
// partagés avec le popover du header. Filtres/recherche synchronisés dans l'URL
// avec des clés préfixées `notif_` (les query params survivent au changement
// d'onglet, voir setTab) ; jamais d'appel serveur pour filtrer.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/Button";
import { libelleRelatif } from "@/lib/heure";
import {
  type FiltreNotif, type NotificationInstitution, type PeriodeNotif,
  FILTRES_NOTIF, LIBELLE_CATEGORIE, LIBELLE_FILTRE, LIBELLE_PERIODE, PERIODES_NOTIF,
  categorieDe, correspondFiltre, correspondPeriode, dateHeureLongue, estFiltreNotif, estPeriodeNotif,
  grouper, libelleType, normaliserRecherche, teintes,
} from "@/lib/notificationsPresentation";
import { T, type ThemeTokens, toUiTokens } from "../theme";
import { IconeCategorie } from "./NotificationsPopoverContent";

// Plafond de GET /api/institution/notifications (limit(30)) : au-delà, rien
// n'est chargé. Sert uniquement à l'indicateur « 30 dernières notifications ».
const LIMITE_API = 30;

export type InfoRdvNotif = { nom?: string; reference?: string; statut?: string };

type Props = {
  active: boolean;
  notifs: NotificationInstitution[];
  nonLuesIds: ReadonlySet<string>;
  chargement: boolean;
  erreur: boolean;
  onReessayer: () => void;
  rdvInfo: (rdvId: string) => InfoRdvNotif | undefined;
  onVoirRdv: (n: NotificationInstitution) => void;
  contenuSysteme: React.ReactNode;
};

const CLAMP_2: React.CSSProperties = { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" };
const TABULAIRE: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

function Styles({ C }: { C: ThemeTokens }) {
  return (
    <style>{`
      .ntf-layout{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:16px;align-items:start}
      .ntf-main{min-width:0}
      .ntf-detail{position:sticky;top:calc(var(--ntf-head,0px) + 12px);max-height:calc(100dvh - var(--ntf-head,0px) - 24px);overflow:auto;background:${C.bgCard};border:1px solid ${C.border};border-radius:10px;display:flex;flex-direction:column}
      .ntf-backdrop{display:none}
      .ntf-row{transition:background-color 140ms ease}
      .ntf-main-btn:hover{background-color:${C.bgCard2}}
      .ntf-main-btn:focus-visible,.ntf-chip:focus-visible,.ntf-ghost:focus-visible,.ntf-input:focus-visible,.ntf-tab:focus-visible,.ntf-act:focus-visible{outline:2px solid ${C.gold};outline-offset:-2px}
      .ntf-chip{transition:background-color 140ms ease,border-color 140ms ease}
      .ntf-act{opacity:0;transition:opacity 140ms ease}
      .ntf-row:hover .ntf-act,.ntf-row:focus-within .ntf-act,.ntf-act[data-visible="true"]{opacity:1}
      .ntf-skel{background:${C.bg3};border-radius:6px;animation:ntfPulse 1.4s ease-in-out infinite}
      .ntf-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
      .ntf-scroll-x{overflow-x:auto;scrollbar-width:none}
      .ntf-scroll-x::-webkit-scrollbar{display:none}
      @keyframes ntfPulse{0%,100%{opacity:1}50%{opacity:.5}}
      @keyframes ntfSlide{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}
      @media(hover:none){.ntf-act{opacity:1}}
      @media(max-width:1279px){
        .ntf-layout{grid-template-columns:minmax(0,1fr)}
        .ntf-detail{display:none;position:fixed;top:0;right:0;bottom:0;max-height:none;width:min(420px,100vw);z-index:300;border-radius:0;border-width:0 0 0 1px;animation:ntfSlide 160ms ease;padding-top:env(safe-area-inset-top)}
        .ntf-detail[data-open="true"]{display:flex}
        .ntf-backdrop[data-open="true"]{display:block;position:fixed;inset:0;z-index:290;background:rgba(0,0,0,0.4)}
      }
      @media(max-width:639px){.ntf-detail{width:100vw;border-width:0}.ntf-row-btn{min-height:76px!important}}
      @media(prefers-reduced-motion:reduce){.ntf-detail{animation:none!important}.ntf-row,.ntf-chip,.ntf-act{transition:none!important}.ntf-skel{animation:none}}
    `}</style>
  );
}

function IcoLoupe() {
  return <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}
function IcoX({ taille = 14 }: { taille?: number }) {
  return <svg aria-hidden="true" width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}
function IcoChevron({ sens, taille = 14 }: { sens: "gauche" | "droite" | "haut" | "bas"; taille?: number }) {
  const pts = sens === "gauche" ? "15 18 9 12 15 6" : sens === "droite" ? "9 18 15 12 9 6" : sens === "haut" ? "18 15 12 9 6 15" : "6 9 12 15 18 9";
  return <svg aria-hidden="true" width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points={pts}/></svg>;
}
const IcoCloche = <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
const IcoAlerte = <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
const IcoFiltre = <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>;

function EtatVide({ C, icone, titre, aide, children }: { C: ThemeTokens; icone: React.ReactNode; titre: string; aide: string; children?: React.ReactNode }) {
  return (
    <div style={{ textAlign: "center", padding: "56px 24px", color: C.t3 }}>
      <div style={{ display: "flex", justifyContent: "center" }}>{icone}</div>
      <div style={{ color: C.t1, fontSize: "15px", fontWeight: 600, marginTop: "10px" }}>{titre}</div>
      <div style={{ color: C.t2, fontSize: "13px", lineHeight: 1.5, margin: "4px auto 0", maxWidth: "360px" }}>{aide}</div>
      {children && <div style={{ marginTop: "16px", display: "flex", justifyContent: "center" }}>{children}</div>}
    </div>
  );
}

function SqueletteLignes({ C }: { C: ThemeTokens }) {
  return (
    <div role="status" aria-label="Chargement des notifications">
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} style={{ display: "flex", gap: "12px", padding: "14px 16px", borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
          <div className="ntf-skel" style={{ width: "36px", height: "36px", borderRadius: "50%", flexShrink: 0 }}/>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
            <div className="ntf-skel" style={{ height: "12px", width: "30%" }}/>
            <div className="ntf-skel" style={{ height: "10px", width: "85%" }}/>
            <div className="ntf-skel" style={{ height: "10px", width: "45%" }}/>
          </div>
        </div>
      ))}
    </div>
  );
}

// Défini au niveau module (jamais dans le composant parent : perte de focus).
function LigneNotification({ C, n, nonLue, selectionnee, info, now, onSelect, onVoirRdv }: {
  C: ThemeTokens; n: NotificationInstitution; nonLue: boolean; selectionnee: boolean; info?: InfoRdvNotif; now: Date;
  onSelect: (id: string) => void; onVoirRdv: (n: NotificationInstitution) => void;
}) {
  const categorie = categorieDe(n);
  const { fond, trait } = teintes(C, categorie);
  const date = new Date(n.created_at);
  const relatif = Number.isNaN(date.getTime()) ? "" : libelleRelatif(date, now);
  const fondLigne = selectionnee ? `${C.gold}14` : nonLue ? C.bgCard2 : "transparent";
  return (
    <li id={`ntf-row-${n.id}`} className="ntf-row" style={{ display: "flex", alignItems: "center", gap: "8px", borderTop: `1px solid ${C.border}`, background: fondLigne, boxShadow: selectionnee ? `inset 2px 0 0 ${C.gold}` : "none", scrollMarginTop: "calc(var(--ntf-head,0px) + var(--ntf-tool,0px) + 36px)" }}>
      <button type="button" className="ntf-main-btn ntf-row-btn" aria-current={selectionnee ? "true" : undefined} onClick={() => onSelect(n.id)} title={`${n.titre}\n${n.message}`}
        style={{ flex: 1, minWidth: 0, display: "flex", gap: "12px", alignItems: "flex-start", minHeight: "72px", padding: "14px 4px 14px 12px", background: "transparent", border: "none", textAlign: "left", cursor: "pointer", color: C.t1, fontFamily: "inherit" }}>
        <span role={nonLue ? "img" : undefined} aria-label={nonLue ? "Non lue" : undefined} aria-hidden={nonLue ? undefined : true}
          style={{ width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0, marginTop: "14px", background: nonLue ? C.gold : "transparent" }}/>
        <span aria-hidden="true" style={{ width: "36px", height: "36px", borderRadius: "50%", background: fond, color: trait, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <IconeCategorie categorie={categorie} taille={17}/>
        </span>
        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
            <span style={{ color: C.t1, fontSize: "14px", fontWeight: nonLue ? 600 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{libelleType(n)}</span>
            <span style={{ color: trait, fontSize: "12px", fontWeight: 500, whiteSpace: "nowrap", flexShrink: 0 }}>{LIBELLE_CATEGORIE[categorie]}</span>
          </span>
          <span style={{ color: C.t2, fontSize: "13px", lineHeight: 1.45, ...CLAMP_2 }}>{n.message}</span>
          <span style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginTop: "2px", color: C.t3, fontSize: "12px" }}>
            {relatif && <span title={dateHeureLongue(n.created_at)} style={TABULAIRE}>{relatif}</span>}
            {info?.nom && <span style={{ color: C.t2, background: C.bg3, borderRadius: "6px", padding: "1px 6px", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{info.nom}</span>}
            {info?.reference && <span style={{ color: C.t2, background: C.bg3, borderRadius: "6px", padding: "1px 6px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{info.reference}</span>}
          </span>
        </span>
      </button>
      {n.rdv_id && (
        <span style={{ paddingRight: "12px", flexShrink: 0 }}>
          <button type="button" className="ntf-act" data-visible={categorie === "action" ? "true" : undefined} onClick={() => onVoirRdv(n)}
            style={{ height: "30px", padding: "0 10px", background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "8px", color: C.t1, fontSize: "12px", fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>
            Voir le rendez-vous
          </button>
        </span>
      )}
    </li>
  );
}

function Detail({ C, n, nonLue, info, now, position, total, onPrec, onSuiv, onFermer, onVoirRdv }: {
  C: ThemeTokens; n: NotificationInstitution | null; nonLue: boolean; info?: InfoRdvNotif; now: Date;
  position: number; total: number; onPrec: () => void; onSuiv: () => void; onFermer: () => void; onVoirRdv: (n: NotificationInstitution) => void;
}) {
  const ui = toUiTokens(C);
  if (!n) {
    return (
      <div style={{ padding: "56px 24px", textAlign: "center", color: C.t3 }}>
        <div style={{ display: "flex", justifyContent: "center" }}>{IcoCloche}</div>
        <div style={{ color: C.t1, fontSize: "14px", fontWeight: 600, marginTop: "10px" }}>Sélectionnez une notification</div>
        <div style={{ color: C.t2, fontSize: "13px", marginTop: "4px", lineHeight: 1.5 }}>Le détail s&apos;affiche ici. Utilisez J / K ou les flèches pour parcourir la liste.</div>
      </div>
    );
  }
  const categorie = categorieDe(n);
  const { fond, trait } = teintes(C, categorie);
  const date = new Date(n.created_at);
  const relatif = Number.isNaN(date.getTime()) ? "" : libelleRelatif(date, now);
  const boutonIco: React.CSSProperties = { width: "32px", height: "32px", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "8px", color: C.t2, cursor: "pointer" };
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button type="button" className="ntf-ghost" aria-label="Notification précédente" onClick={onPrec} disabled={position <= 0} style={{ ...boutonIco, opacity: position <= 0 ? 0.4 : 1, cursor: position <= 0 ? "default" : "pointer" }}><IcoChevron sens="haut"/></button>
          <button type="button" className="ntf-ghost" aria-label="Notification suivante" onClick={onSuiv} disabled={position < 0 || position >= total - 1} style={{ ...boutonIco, opacity: position < 0 || position >= total - 1 ? 0.4 : 1, cursor: position < 0 || position >= total - 1 ? "default" : "pointer" }}><IcoChevron sens="bas"/></button>
          {position >= 0 && <span style={{ color: C.t3, fontSize: "12px", marginLeft: "4px", ...TABULAIRE }}>{position + 1} / {total}</span>}
        </div>
        <button type="button" className="ntf-ghost" aria-label="Fermer le détail" onClick={onFermer} style={boutonIco}><IcoX/></button>
      </div>
      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span aria-hidden="true" style={{ width: "40px", height: "40px", borderRadius: "50%", background: fond, color: trait, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><IconeCategorie categorie={categorie} taille={18}/></span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, color: C.t1, fontSize: "16px", fontWeight: 600 }}>{libelleType(n)}</h2>
              <span style={{ color: trait, background: fond, borderRadius: "6px", padding: "1px 8px", fontSize: "12px", fontWeight: 500 }}>{LIBELLE_CATEGORIE[categorie]}</span>
              {nonLue && <span style={{ color: C.t2, fontSize: "12px" }}>Non lue</span>}
            </div>
            <div style={{ color: C.t3, fontSize: "12px", marginTop: "2px", ...TABULAIRE }}>{dateHeureLongue(n.created_at)}{relatif ? ` · ${relatif}` : ""}</div>
          </div>
        </div>

        <div>
          <div style={{ color: C.t3, fontSize: "12px", marginBottom: "4px" }}>{n.titre}</div>
          <p style={{ margin: 0, color: C.t1, fontSize: "14px", lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{n.message}</p>
        </div>

        {n.rdv_id && (
          <section aria-label="Rendez-vous lié" style={{ border: `1px solid ${C.border}`, borderRadius: "10px", padding: "12px", background: C.bgCard2, display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ color: C.t3, fontSize: "12px", fontWeight: 500 }}>Rendez-vous lié</div>
            {info ? (
              <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px", fontSize: "13px" }}>
                {info.nom && <><dt style={{ color: C.t3 }}>Citoyen</dt><dd style={{ margin: 0, color: C.t1 }}>{info.nom}</dd></>}
                {info.reference && <><dt style={{ color: C.t3 }}>Référence</dt><dd style={{ margin: 0, color: C.t1, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{info.reference}</dd></>}
                {info.statut && <><dt style={{ color: C.t3 }}>Statut</dt><dd style={{ margin: 0 }}><span style={{ color: C.t2, background: C.bg3, borderRadius: "6px", padding: "1px 8px", fontSize: "12px" }}>{info.statut}</span></dd></>}
              </dl>
            ) : (
              <div style={{ color: C.t2, fontSize: "13px" }}>Les détails de ce rendez-vous ne sont pas chargés ici.</div>
            )}
            <Button tokens={ui} className="tap" variant="primary" size="md" onClick={() => onVoirRdv(n)} style={{ height: "36px" }}>Voir le rendez-vous</Button>
          </section>
        )}

        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px", fontSize: "12px", borderTop: `1px solid ${C.border}`, paddingTop: "12px" }}>
          <dt style={{ color: C.t3 }}>Type</dt><dd style={{ margin: 0, color: C.t2, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{n.type ?? "—"}</dd>
          <dt style={{ color: C.t3 }}>Identifiant</dt><dd style={{ margin: 0, color: C.t2, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", overflowWrap: "anywhere" }}>{n.id}</dd>
          <dt style={{ color: C.t3 }}>Créée le</dt><dd style={{ margin: 0, color: C.t2, ...TABULAIRE }}>{dateHeureLongue(n.created_at)}</dd>
        </dl>
      </div>
    </>
  );
}

function Chip({ C, actif, onClick, children, compteur }: { C: ThemeTokens; actif: boolean; onClick: () => void; children: React.ReactNode; compteur?: number }) {
  return (
    <button type="button" className="ntf-chip" aria-pressed={actif} onClick={onClick}
      style={{ height: "30px", padding: "0 10px", display: "inline-flex", alignItems: "center", gap: "6px", flexShrink: 0, whiteSpace: "nowrap", borderRadius: "15px", cursor: "pointer", fontFamily: "inherit", fontSize: "13px", fontWeight: actif ? 600 : 500,
        color: actif ? C.t1 : C.t2, background: actif ? `${C.gold}1f` : "transparent", border: `1px solid ${actif ? C.gold : C.border2}` }}>
      {actif && <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
      {children}
      {compteur !== undefined && <span style={{ color: C.t3, fontSize: "12px", ...TABULAIRE }}>{compteur}</span>}
    </button>
  );
}

export function NotificationsPage({ active, notifs, nonLuesIds, chargement, erreur, onReessayer, rdvInfo, onVoirRdv, contenuSysteme }: Props) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [onglet, setOnglet] = useState<"utilisateur" | "systeme">("utilisateur");
  const [q, setQ] = useState(() => searchParams.get("notif_q") ?? "");
  const [filtre, setFiltre] = useState<FiltreNotif>(() => { const v = searchParams.get("notif_f"); return estFiltreNotif(v) ? v : "toutes"; });
  const [periode, setPeriode] = useState<PeriodeNotif>(() => { const v = searchParams.get("notif_p"); return estPeriodeNotif(v) ? v : "tout"; });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hauteurHeader, setHauteurHeader] = useState(0);
  const [hauteurOutils, setHauteurOutils] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const outilsRef = useRef<HTMLDivElement>(null);
  // Instant de référence des libellés relatifs/regroupements : recalculé quand
  // les données ou la visibilité changent (écran gardé monté en arrière-plan).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `notifs` et `active` sont les déclencheurs voulus du recalcul
  const maintenant = useMemo(() => new Date(), [notifs, active]);

  // Synchronisation URL (replace : pas d'entrée d'historique par frappe), seulement
  // quand l'écran est visible, et en conservant les autres query params.
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => {
      const qp = new URLSearchParams(searchParams.toString());
      const poser = (cle: string, valeur: string, defaut: string) => { if (valeur && valeur !== defaut) qp.set(cle, valeur); else qp.delete(cle); };
      poser("notif_q", q.trim(), "");
      poser("notif_f", filtre, "toutes");
      poser("notif_p", periode, "tout");
      if (qp.toString() !== searchParams.toString()) router.replace(`${pathname}${qp.toString() ? `?${qp.toString()}` : ""}`, { scroll: false });
    }, 250);
    return () => clearTimeout(t);
  }, [active, q, filtre, periode, searchParams, pathname, router]);

  // Décalages sticky : hauteur réelle du header du dashboard et de la barre d'outils.
  useEffect(() => {
    if (!active) return;
    const header = document.querySelector<HTMLElement>("header");
    const mesurer = () => { setHauteurHeader(header?.offsetHeight ?? 0); setHauteurOutils(outilsRef.current?.offsetHeight ?? 0); };
    mesurer();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(mesurer);
    if (header) ro.observe(header);
    if (outilsRef.current) ro.observe(outilsRef.current);
    return () => ro.disconnect();
  }, [active, onglet]);

  const recherche = normaliserRecherche(q);
  const correspondRecherche = (n: NotificationInstitution) => {
    if (!recherche) return true;
    const info = n.rdv_id ? rdvInfo(n.rdv_id) : undefined;
    const meule = [libelleType(n), n.message, n.titre, n.type ?? "", info?.nom ?? "", info?.reference ?? ""].join(" ");
    return normaliserRecherche(meule).includes(recherche);
  };

  const horsFiltre = useMemo(() => notifs.filter(n => correspondPeriode(n.created_at, periode, maintenant) && correspondRecherche(n)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- correspondRecherche dépend de q (via `recherche`) et de rdvInfo, déjà couverts
    [notifs, periode, recherche, rdvInfo, maintenant]);
  const visibles = useMemo(() => horsFiltre.filter(n => correspondFiltre(n, filtre, nonLuesIds)), [horsFiltre, filtre, nonLuesIds]);
  const groupes = useMemo(() => grouper(visibles, maintenant), [visibles, maintenant]);
  const aplati = useMemo(() => groupes.flatMap(g => g.items), [groupes]);
  const compteurs = useMemo(() => {
    const c: Record<FiltreNotif, number> = { toutes: 0, non_lues: 0, action: 0, info: 0, alerte: 0 };
    for (const f of FILTRES_NOTIF) c[f] = horsFiltre.filter(n => correspondFiltre(n, f, nonLuesIds)).length;
    return c;
  }, [horsFiltre, nonLuesIds]);

  const nbNonLues = notifs.filter(n => nonLuesIds.has(n.id)).length;
  const nbATraiter = notifs.filter(n => categorieDe(n) === "action").length;
  const selection = selectedId ? notifs.find(n => n.id === selectedId) ?? null : null;
  const position = selection ? aplati.findIndex(n => n.id === selection.id) : -1;
  const filtresActifs = filtre !== "toutes" || periode !== "tout" || q.trim() !== "";

  function reinitialiser() { setQ(""); setFiltre("toutes"); setPeriode("tout"); }
  function aller(delta: number) {
    if (aplati.length === 0) return;
    const cible = position < 0 ? (delta > 0 ? 0 : aplati.length - 1) : Math.min(aplati.length - 1, Math.max(0, position + delta));
    const n = aplati[cible];
    setSelectedId(n.id);
    requestAnimationFrame(() => document.getElementById(`ntf-row-${n.id}`)?.scrollIntoView({ block: "nearest" }));
  }

  // Raccourcis : « / » recherche, J/K et ↑/↓ navigation, Échap ferme le volet.
  // Jamais de piège de focus : Tab n'est pas intercepté.
  useEffect(() => {
    if (!active || onglet !== "utilisateur") return;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const saisie = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.key === "Escape") {
        if (saisie && t === inputRef.current && q) { setQ(""); return; }
        if (selectedId) setSelectedId(null);
        return;
      }
      if (saisie) return;
      if (e.key === "/") { e.preventDefault(); inputRef.current?.focus(); return; }
      if (e.key === "j" || e.key === "J") { e.preventDefault(); aller(1); return; }
      if (e.key === "k" || e.key === "K") { e.preventDefault(); aller(-1); return; }
      if (selectedId && e.key === "ArrowDown") { e.preventDefault(); aller(1); return; }
      if (selectedId && e.key === "ArrowUp") { e.preventDefault(); aller(-1); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `aller` est recréée à chaque rendu et lit position/aplati, déjà listés
  }, [active, onglet, q, selectedId, position, aplati]);

  const ui = toUiTokens(C);
  const cssVars = { "--ntf-head": `${hauteurHeader}px`, "--ntf-tool": `${hauteurOutils}px` } as React.CSSProperties;
  const aucuneNotif = notifs.length === 0;
  const plafond = notifs.length >= LIMITE_API;

  return (
    <div className="yelen-page" style={{ padding: "20px 16px 40px", ...cssVars }}>
      <Styles C={C}/>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "8px 16px", marginBottom: "12px" }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ color: C.t1, fontSize: "24px", fontWeight: 600, lineHeight: 1.25, margin: "0 0 4px" }}>Notifications</h1>
          <p style={{ color: C.t2, fontSize: "13.5px", margin: 0, ...TABULAIRE }}>{chargement ? "Chargement…" : nbATraiter > 0 ? `${nbATraiter} à traiter` : nbNonLues > 0 ? `${nbNonLues} non lue${nbNonLues > 1 ? "s" : ""}` : "Tout est à jour"}</p>
        </div>
      </div>

      <div role="tablist" aria-label="Type de notifications" style={{ display: "flex", gap: "4px", borderBottom: `1px solid ${C.border}`, marginBottom: "12px" }}>
        {([{ key: "utilisateur", label: "Mes notifications", compteur: nbNonLues }, { key: "systeme", label: "Système", compteur: 0 }] as const).map(o => {
          const actif = onglet === o.key;
          return (
            <button key={o.key} type="button" role="tab" aria-selected={actif} className="ntf-tab" onClick={() => setOnglet(o.key)}
              style={{ background: actif ? C.bgCard : "transparent", border: "none", borderBottom: `2px solid ${actif ? C.gold : "transparent"}`, marginBottom: "-1px", borderRadius: "6px 6px 0 0", padding: "9px 12px", color: actif ? C.t1 : C.t2, fontSize: "13px", fontWeight: actif ? 600 : 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: "inherit" }}>
              {o.label}
              {o.compteur > 0 && <span style={{ background: C.bg3, color: C.t2, fontSize: "11px", fontWeight: 500, borderRadius: "8px", padding: "0 6px", minWidth: "16px", textAlign: "center", ...TABULAIRE }}>{o.compteur}</span>}
            </button>
          );
        })}
      </div>

      {onglet === "systeme" ? (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px" }}>{contenuSysteme}</div>
      ) : (
        <div className="ntf-layout">
          <div className="ntf-main">
            <div ref={outilsRef} style={{ position: "sticky", top: "var(--ntf-head,0px)", zIndex: 5, background: C.bg, padding: "4px 0 12px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ position: "relative" }}>
                <span aria-hidden="true" style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)", color: C.t3, display: "flex" }}><IcoLoupe/></span>
                <input ref={inputRef} className="ntf-input" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher une notification, un citoyen, une référence" aria-label="Rechercher dans les notifications"
                  style={{ width: "100%", boxSizing: "border-box", height: "36px", padding: "0 64px 0 34px", background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", color: C.t1, fontSize: "13.5px", fontFamily: "inherit", WebkitAppearance: "none" }}/>
                {q ? (
                  <button type="button" className="ntf-ghost" aria-label="Effacer la recherche" onClick={() => { setQ(""); inputRef.current?.focus(); }}
                    style={{ position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)", width: "26px", height: "26px", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", borderRadius: "6px", color: C.t2, cursor: "pointer" }}><IcoX/></button>
                ) : (
                  <kbd aria-hidden="true" style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: C.t3, fontSize: "11px", border: `1px solid ${C.border2}`, borderRadius: "4px", padding: "0 5px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>/</kbd>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                <div role="group" aria-label="Filtrer par catégorie" style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {FILTRES_NOTIF.map(f => <Chip key={f} C={C} actif={filtre === f} onClick={() => setFiltre(f)} compteur={compteurs[f]}>{LIBELLE_FILTRE[f]}</Chip>)}
                </div>
                <span aria-hidden="true" style={{ width: "1px", height: "18px", background: C.border2, flexShrink: 0, margin: "0 4px" }}/>
                <div role="group" aria-label="Filtrer par période" style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {PERIODES_NOTIF.map(p => <Chip key={p} C={C} actif={periode === p} onClick={() => setPeriode(p)}>{LIBELLE_PERIODE[p]}</Chip>)}
                </div>
                <span aria-live="polite" role="status" style={{ marginLeft: "auto", color: C.t3, fontSize: "12px", whiteSpace: "nowrap", ...TABULAIRE }}>
                  {chargement || erreur ? "" : `${visibles.length} résultat${visibles.length > 1 ? "s" : ""}`}
                </span>
              </div>

              {filtresActifs && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  {filtre !== "toutes" && <ChipActif C={C} label={LIBELLE_FILTRE[filtre]} onRetirer={() => setFiltre("toutes")}/>}
                  {periode !== "tout" && <ChipActif C={C} label={LIBELLE_PERIODE[periode]} onRetirer={() => setPeriode("tout")}/>}
                  {q.trim() && <ChipActif C={C} label={`« ${q.trim()} »`} onRetirer={() => setQ("")}/>}
                  <button type="button" className="ntf-ghost" onClick={reinitialiser} style={{ background: "none", border: "none", color: C.t2, fontSize: "12px", textDecoration: "underline", cursor: "pointer", padding: "2px 4px", fontFamily: "inherit" }}>Réinitialiser les filtres</button>
                </div>
              )}
            </div>

            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", overflow: "clip" }}>
              {chargement ? <SqueletteLignes C={C}/>
                : erreur ? (
                  <EtatVide C={C} icone={IcoAlerte} titre="Notifications indisponibles" aide="Le chargement a échoué. Vérifiez votre connexion puis réessayez.">
                    <Button tokens={ui} className="tap" variant="secondary" size="md" onClick={onReessayer}>Réessayer</Button>
                  </EtatVide>
                )
                : aucuneNotif ? <EtatVide C={C} icone={IcoCloche} titre="Aucune notification" aide="Les nouvelles visites, messages, documents reçus et décisions de Yelen apparaîtront ici dès qu'un événement nécessite votre attention."/>
                : visibles.length === 0 ? (
                  <EtatVide C={C} icone={IcoFiltre} titre="Aucun résultat pour ces filtres" aide="Modifiez votre recherche ou élargissez la période.">
                    <Button tokens={ui} className="tap" variant="secondary" size="md" onClick={reinitialiser}>Réinitialiser les filtres</Button>
                  </EtatVide>
                )
                : (
                  <div>
                    {groupes.map(g => (
                      <section key={g.groupe} aria-label={g.groupe}>
                        <h2 style={{ position: "sticky", top: "calc(var(--ntf-head,0px) + var(--ntf-tool,0px))", zIndex: 4, margin: 0, padding: "8px 16px", background: C.bgCard2, borderTop: `1px solid ${C.border}`, color: C.t3, fontSize: "12px", fontWeight: 500, display: "flex", gap: "6px" }}>
                          {g.groupe}<span style={TABULAIRE}>· {g.items.length}</span>
                        </h2>
                        <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                          {g.items.map(n => (
                            <LigneNotification key={n.id} C={C} n={n} nonLue={nonLuesIds.has(n.id)} selectionnee={selectedId === n.id}
                              info={n.rdv_id ? rdvInfo(n.rdv_id) : undefined} now={maintenant} onSelect={setSelectedId} onVoirRdv={onVoirRdv}/>
                          ))}
                        </ul>
                      </section>
                    ))}
                    {plafond && (
                      <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 16px", color: C.t3, fontSize: "12px", textAlign: "center" }}>
                        {LIMITE_API} dernières notifications — les plus anciennes ne sont pas affichées.
                      </div>
                    )}
                  </div>
                )}
            </div>
          </div>

          <div className="ntf-backdrop" data-open={selection && active ? "true" : undefined} onClick={() => setSelectedId(null)} aria-hidden="true"/>
          <aside className="ntf-detail" data-open={selection && active ? "true" : undefined} aria-label="Détail de la notification">
            <Detail C={C} n={selection} nonLue={selection ? nonLuesIds.has(selection.id) : false} info={selection?.rdv_id ? rdvInfo(selection.rdv_id) : undefined} now={maintenant}
              position={position} total={aplati.length} onPrec={() => aller(-1)} onSuiv={() => aller(1)} onFermer={() => setSelectedId(null)} onVoirRdv={onVoirRdv}/>
          </aside>
        </div>
      )}
    </div>
  );
}

function ChipActif({ C, label, onRetirer }: { C: ThemeTokens; label: string; onRetirer: () => void }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", height: "22px", padding: "0 4px 0 8px", background: C.bg3, color: C.t1, borderRadius: "11px", fontSize: "12px", maxWidth: "220px" }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <button type="button" className="ntf-ghost" aria-label={`Retirer le filtre ${label}`} onClick={onRetirer}
        style={{ width: "16px", height: "16px", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", borderRadius: "8px", color: C.t2, cursor: "pointer", padding: 0 }}><IcoX taille={10}/></button>
    </span>
  );
}
