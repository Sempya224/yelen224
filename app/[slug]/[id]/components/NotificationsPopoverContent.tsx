"use client";

// Contenu du popover « Notifications » du header (refonte d'affichage,
// 22/10/2026). Présentation uniquement : la source des notifications, leur
// texte serveur et le marquage lu/non lu restent dans layout.tsx / l'API.
// La salutation figée en base (« Bon après-midi, {établissement} ») n'est pas
// affichée dans la carte — elle reste dans l'info-bulle du texte complet.
import React from "react";
import { Button } from "@/components/ui/Button";
import { heureDepuisHorodatage, libelleRelatif } from "@/lib/heure";
import {
  type CategorieNotif, type NotificationInstitution,
  LIBELLE_CATEGORIE, categorieDe, grouper, teintes, titreCarte,
} from "@/lib/notificationsPresentation";
import { type ThemeTokens, toUiTokens } from "../theme";
import { PopoverEmpty, PopoverFooter } from "./PopoverUi";

export type { NotificationInstitution };

const IcoCloche = <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
const IcoAlerteVide = <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;

export function IconeCategorie({ categorie, taille = 16 }: { categorie: CategorieNotif; taille?: number }) {
  const p = { width: taille, height: taille, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (categorie === "action") return <svg {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
  if (categorie === "alerte") return <svg {...p}><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>;
  return <svg {...p}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>;
}

const MAX_POPOVER = 5;

const CLAMP_2: React.CSSProperties = { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" };

// Défini au niveau module (jamais dans le composant parent : perte de focus
// à chaque rendu, voir /pieges-techniques-connus).
function CarteNotification({ C, n, nonLue, nomCitoyen, now, onOuvrir }: {
  C: ThemeTokens; n: NotificationInstitution; nonLue: boolean; nomCitoyen?: string; now: Date; onOuvrir: (n: NotificationInstitution) => void;
}) {
  const categorie = categorieDe(n);
  const { fond, trait } = teintes(C, categorie);
  const cliquable = !!n.rdv_id;
  const date = new Date(n.created_at);
  const heure = heureDepuisHorodatage(date);
  const quand = Number.isNaN(date.getTime()) ? "" : `${heure ? `${heure} · ` : ""}${libelleRelatif(date, now)}`;
  const infoBulle = `${n.titre}\n${n.message}`;
  const style: React.CSSProperties = {
    display: "flex", gap: "10px", width: "100%", boxSizing: "border-box", padding: "10px 12px 10px 8px", borderRadius: "10px", textAlign: "left", fontFamily: "inherit",
    background: nonLue ? C.bgCard2 : "transparent", border: "none", color: C.t1, cursor: cliquable ? "pointer" : "default",
  };
  const contenu = (
    <>
      <span aria-hidden={!nonLue} aria-label={nonLue ? "Non lue" : undefined} role={nonLue ? "img" : undefined}
        style={{ width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0, marginTop: "14px", background: nonLue ? C.gold : "transparent" }}/>
      <span style={{ width: "32px", height: "32px", borderRadius: "50%", background: fond, color: trait, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <IconeCategorie categorie={categorie}/>
      </span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
        <span style={{ color: trait, fontSize: "12px", fontWeight: 500 }}>{LIBELLE_CATEGORIE[categorie]}</span>
        <span style={{ color: C.t1, fontSize: "14px", fontWeight: nonLue ? 600 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titreCarte(n)}</span>
        <span style={{ color: C.t2, fontSize: "13px", lineHeight: 1.45, ...CLAMP_2 }}>{n.message}</span>
        <span style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginTop: "2px" }}>
          {quand && <span style={{ color: C.t3, fontSize: "12px" }}>{quand}</span>}
          {nomCitoyen && <span style={{ color: C.t2, fontSize: "12px", background: C.bg3, borderRadius: "6px", padding: "1px 6px", maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomCitoyen}</span>}
        </span>
      </span>
      {cliquable && (
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, alignSelf: "center" }}><polyline points="9 6 15 12 9 18"/></svg>
      )}
    </>
  );
  return cliquable
    ? <button type="button" className="hp-item tap" title={infoBulle} onClick={() => onOuvrir(n)} style={style}>{contenu}</button>
    : <div title={infoBulle} style={style}>{contenu}</div>;
}

function SqueletteCartes({ C }: { C: ThemeTokens }) {
  return (
    <div role="status" aria-label="Chargement des notifications" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} style={{ display: "flex", gap: "10px", padding: "10px 12px 10px 8px" }}>
          <div style={{ width: "8px", flexShrink: 0 }}/>
          <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: C.bg3, flexShrink: 0 }}/>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ height: "12px", width: "40%", borderRadius: "4px", background: C.bg3 }}/>
            <div style={{ height: "10px", width: "90%", borderRadius: "4px", background: C.bgCard2 }}/>
            <div style={{ height: "10px", width: "60%", borderRadius: "4px", background: C.bgCard2 }}/>
          </div>
        </div>
      ))}
    </div>
  );
}

export type OngletNotif = "utilisateur" | "systeme";

export function NotificationsPopoverContent({ C, notifs, nonLuesIds, chargement, erreur, onReessayer, nomPourRdv, onOuvrir, onVoirToutes, onglet, onChangerOnglet, contenuSysteme }: {
  C: ThemeTokens;
  notifs: NotificationInstitution[];
  // Ids des notifications non lues AU MOMENT de l'ouverture du popover
  // (le marquage lu, lui, se fait toujours à l'ouverture, côté layout).
  nonLuesIds: ReadonlySet<string>;
  chargement: boolean;
  erreur: boolean;
  onReessayer: () => void;
  nomPourRdv: (rdvId: string) => string | undefined;
  onOuvrir: (n: NotificationInstitution) => void;
  onVoirToutes: () => void;
  onglet: OngletNotif;
  onChangerOnglet: (o: OngletNotif) => void;
  contenuSysteme: React.ReactNode;
}) {
  const now = new Date();
  const nbNonLues = notifs.filter(n => nonLuesIds.has(n.id)).length;
  // Affichage limité aux plus récentes (ordre de la liste conservé) ; les
  // compteurs ci-dessus restent calculés sur l'ensemble.
  const affichees = notifs.slice(0, MAX_POPOVER);
  const nbRestantes = notifs.length - affichees.length;
  const onglets: { key: OngletNotif; label: string; compteur: number }[] = [
    { key: "utilisateur", label: "Mes notifications", compteur: nbNonLues },
    { key: "systeme", label: "Système", compteur: 0 },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "12px", borderBottom: `1px solid ${C.border}` }}>
        <div role="tablist" aria-label="Type de notifications" style={{ display: "flex", gap: "4px" }}>
          {onglets.map(o => {
            const actif = onglet === o.key;
            return (
              <button key={o.key} type="button" role="tab" aria-selected={actif} className="hp-item" onClick={() => onChangerOnglet(o.key)}
                style={{ background: actif ? C.bgCard : "transparent", border: "none", borderBottom: `2px solid ${actif ? C.gold : "transparent"}`, marginBottom: "-1px", borderRadius: "6px 6px 0 0", padding: "8px 10px", color: actif ? C.t1 : C.t2, fontSize: "13px", fontWeight: actif ? 600 : 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: "inherit" }}>
                {o.label}
                {o.compteur > 0 && <span style={{ background: C.bg3, color: C.t2, fontSize: "11px", fontWeight: 500, borderRadius: "8px", padding: "0 6px", minWidth: "16px", textAlign: "center" }}>{o.compteur}</span>}
              </button>
            );
          })}
        </div>
        {onglet === "utilisateur" && nbNonLues > 0 && !erreur && (
          <span style={{ color: C.t3, fontSize: "12px", whiteSpace: "nowrap" }}>{nbNonLues} non lue{nbNonLues > 1 ? "s" : ""}</span>
        )}
      </div>

      {onglet === "systeme" ? contenuSysteme
        : chargement ? <SqueletteCartes C={C}/>
        : erreur ? (
          <div>
            <PopoverEmpty C={C} icone={IcoAlerteVide} titre="Notifications indisponibles" aide="Le chargement a échoué. Vérifiez votre connexion puis réessayez."/>
            <div style={{ display: "flex", justifyContent: "center", paddingBottom: "8px" }}>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={onReessayer}>Réessayer</Button>
            </div>
          </div>
        )
        : notifs.length === 0 ? <PopoverEmpty C={C} icone={IcoCloche} titre="Aucune notification" aide="Vous serez averti dès qu'un événement nécessite votre attention."/>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {grouper(affichees, now).map(g => (
              <section key={g.groupe} aria-label={g.groupe}>
                <h3 style={{ margin: "0 0 4px 8px", color: C.t3, fontSize: "12px", fontWeight: 500 }}>{g.groupe}</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  {g.items.map(n => (
                    <CarteNotification key={n.id} C={C} n={n} nonLue={nonLuesIds.has(n.id)} nomCitoyen={n.rdv_id ? nomPourRdv(n.rdv_id) : undefined} now={now} onOuvrir={onOuvrir}/>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      {onglet === "utilisateur" && <PopoverFooter C={C} label={nbRestantes > 0 ? `Voir toutes les notifications (${nbRestantes} autre${nbRestantes > 1 ? "s" : ""})` : "Voir toutes les notifications"} onClick={onVoirToutes}/>}
    </div>
  );
}
