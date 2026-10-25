"use client";

// Fiche de détail d'une entrée du Journal d'activité (refonte 24/10/2026) :
// dialogue accessible (role="dialog", aria-modal, piège à focus, Échap, retour
// du focus au déclencheur), bottom sheet sur mobile et dialogue centré dès
// 1024 px (même convention que ConfirmModal / .client-fiche-*). Les données
// "Activité voisine" et "Échanges avec ce client" sont lues ici, avec les
// mêmes routes qu'avant.
import { useEffect, useId, useRef, useState } from "react";
import type { ThemeTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { toUiTokens } from "../theme";
import { YelenLoader } from "@/components/YelenLoader";
import { dateHeureComplete } from "@/lib/heure";
import {
  CATEGORIES, ClientBadge, Icon, LibelleAction, MONO, NiveauTexte, PLATEFORMES, cleLisible, dateCourteHeure,
  formaterValeur, libelleCible, libelleLigne, meta, risqueDe, type Entree,
} from "./JournalUi";

type Ligne = { label: string; valeur: string; mono?: boolean };

function BlocLignes({ C, lignes }: { C: ThemeTokens; lignes: Ligne[] }) {
  return (
    <dl style={{ margin: 0, backgroundColor: C.bg3, borderRadius: "10px", padding: "4px 12px" }}>
      {lignes.map((l, i) => (
        <div key={`${l.label}-${i}`} style={{ display: "flex", justifyContent: "space-between", gap: "16px", padding: "8px 0", borderBottom: i < lignes.length - 1 ? `1px solid ${C.border}` : "none" }}>
          <dt style={{ color: C.t2, fontSize: "12.5px", flexShrink: 0 }}>{l.label}</dt>
          <dd style={{ margin: 0, color: C.t1, fontSize: "13px", fontWeight: 600, textAlign: "right", overflowWrap: "anywhere", fontFamily: l.mono ? MONO : "inherit" }}>{l.valeur}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ C, titre, sousTitre, children }: { C: ThemeTokens; titre: string; sousTitre?: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: "18px" }}>
      <h3 style={{ color: C.t1, fontSize: "13px", fontWeight: 600, margin: sousTitre ? "0 0 2px" : "0 0 8px" }}>{titre}</h3>
      {sousTitre && <p style={{ color: C.t2, fontSize: "12px", margin: "0 0 8px" }}>{sousTitre}</p>}
      {children}
    </section>
  );
}

export function JournalFiche({ C, entree, roleLabel, ipMasquee, onClose, onCopier, onPartager }: {
  C: ThemeTokens; entree: Entree; roleLabel: string | null; ipMasquee: boolean;
  onClose: () => void; onCopier: (e: Entree) => void; onPartager: (e: Entree) => void;
}) {
  const idTitre = useId();
  const refPanneau = useRef<HTMLDivElement>(null);
  const refDeclencheur = useRef<HTMLElement | null>(null);
  const [avant, setAvant] = useState<Entree[]>([]);
  const [apres, setApres] = useState<Entree[]>([]);
  const [contexteChargement, setContexteChargement] = useState(true);
  const [echanges, setEchanges] = useState<Entree[]>([]);

  // Accessibilité du dialogue : focus dans le panneau, Tab piégé, Échap ferme,
  // focus rendu au déclencheur.
  useEffect(() => {
    refDeclencheur.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => refPanneau.current?.focus(), 30);
    const surTouche = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") { ev.stopPropagation(); onClose(); return; }
      if (ev.key !== "Tab" || !refPanneau.current) return;
      const f = refPanneau.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])");
      if (f.length === 0) { ev.preventDefault(); return; }
      const premier = f[0], dernier = f[f.length - 1], actif = document.activeElement;
      if (ev.shiftKey && (actif === premier || actif === refPanneau.current)) { ev.preventDefault(); dernier.focus(); }
      else if (!ev.shiftKey && actif === dernier) { ev.preventDefault(); premier.focus(); }
    };
    document.addEventListener("keydown", surTouche);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", surTouche);
      refDeclencheur.current?.focus?.();
    };
  }, [onClose]);

  // Activité voisine : 3 événements précédents et suivants de l'établissement.
  useEffect(() => {
    let annule = false;
    fetch(`/api/institution/journal/contexte?entry_id=${entree.id}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!annule) { setAvant(j?.avant ?? []); setApres(j?.apres ?? []); } })
      .catch(() => { if (!annule) { setAvant([]); setApres([]); } })
      .finally(() => { if (!annule) setContexteChargement(false); });
    return () => { annule = true; };
  }, [entree.id]);

  // Échanges avec ce client (messages) : même cible, catégorie communication.
  useEffect(() => {
    let annule = false;
    const estMessage = entree.action === "message_envoye" || entree.action === "message_recu";
    if (!estMessage || !entree.cible_id) { setEchanges([]); return; }
    const params = new URLSearchParams({ cible_ids: entree.cible_id, categorie: "communication", limit: "20" });
    fetch(`/api/institution/journal?${params.toString()}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!annule) setEchanges((j?.entrees ?? []).slice().reverse()); })
      .catch(() => { if (!annule) setEchanges([]); });
    return () => { annule = true; };
  }, [entree.id, entree.action, entree.cible_id]);

  const m = meta(entree.action);
  const risque = risqueDe(entree);
  const cible = entree.cible_table ? libelleCible(entree.cible_table) : null;
  const categorie = CATEGORIES.find(c => c.value === entree.categorie)?.label ?? entree.categorie;
  const plateforme = PLATEFORMES.find(p => p.value === entree.plateforme)?.label ?? entree.plateforme;

  const lignesGenerales: Ligne[] = [
    { label: "Référence", valeur: entree.audit_id, mono: true },
    { label: "Membre", valeur: entree.membre_nom },
    { label: "Rôle", valeur: roleLabel ?? "—" },
    { label: "Catégorie", valeur: categorie },
    ...(cible ? [{ label: "Cible", valeur: cible.texte, mono: cible.brut }] : []),
    ...Object.entries(entree.details || {}).map(([k, v]) => ({ label: cleLisible(k), valeur: formaterValeur(v) })),
  ];

  const lignesContexte: Ligne[] = [
    { label: "Navigateur", valeur: entree.navigateur ?? "—" },
    { label: "Système", valeur: entree.os ?? "—" },
    ipMasquee
      ? { label: "Adresse IP", valeur: "Réservée à l'administration" }
      : { label: "Adresse IP", valeur: entree.ip ?? "—", mono: true },
    { label: "Plateforme", valeur: plateforme },
  ];

  const clientNom = entree.action === "message_recu"
    ? entree.membre_nom
    : (typeof entree.details?.client_nom === "string" ? entree.details.client_nom : null);

  const voisins = [...avant, entree, ...apres];

  return (
    <div className="jr-fiche-fond" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1200, backgroundColor: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <style>{`
        .jr-fiche-fond{animation:jr-fondu .15s ease}
        @keyframes jr-fondu{from{opacity:0}to{opacity:1}}
        @media (min-width:1024px){
          .jr-fiche-fond{align-items:center !important}
          .jr-fiche{max-width:560px !important;border-radius:16px !important;max-height:86svh !important}
          .jr-fiche-grip{display:none !important}
        }
        @media (prefers-reduced-motion:reduce){.jr-fiche-fond{animation:none}}
      `}</style>
      <div ref={refPanneau} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={idTitre} className="jr-fiche"
        onClick={e => e.stopPropagation()}
        style={{ position: "relative", backgroundColor: C.bgCard, borderRadius: "16px 16px 0 0", padding: "18px 20px 20px", width: "100%", maxWidth: "480px", maxHeight: "86svh", overflowY: "auto", border: `1px solid ${C.border2}`, outline: "none", boxSizing: "border-box" }}>
        <div className="jr-fiche-grip" aria-hidden="true" style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.border2, margin: "0 auto 14px" }}/>

        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
          <div aria-hidden="true" style={{ width: "40px", height: "40px", borderRadius: "10px", backgroundColor: `${m.couleur(C)}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name={m.iconKey} size={18} color={m.couleur(C)}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id={idTitre} style={{ color: C.t1, fontSize: "16px", fontWeight: 600, margin: 0, overflowWrap: "anywhere" }}>
              {m.brut ? <LibelleAction C={C} e={entree} taille={15}/> : libelleLigne(entree)}
            </h2>
            <p style={{ color: C.t2, fontSize: "12.5px", margin: "2px 0 0" }}>{dateHeureComplete(entree.created_at)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer la fiche" className="yelen-focus-ring"
            style={{ ["--yelen-focus" as string]: C.gold, width: "36px", height: "36px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: C.bg3, border: "none", borderRadius: "50%", cursor: "pointer" }}>
            <Icon name="x" size={14} color={C.t2}/>
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px 12px", margin: "12px 0 0" }}>
          <NiveauTexte C={C} risque={risque}/>
          <ClientBadge C={C} action={entree.action}/>
        </div>

        {risque !== "vert" && (
          <p style={{ backgroundColor: `${C.blue}10`, border: `1px solid ${C.blue}30`, borderRadius: "10px", padding: "10px 12px", margin: "12px 0 0", color: C.t2, fontSize: "12px", lineHeight: 1.6 }}>
            {risque === "rouge"
              ? "Un niveau critique peut notamment correspondre à une suppression définitive, un changement de rôle de membre ou un accès refusé. C'est une alerte automatique du système, elle ne modifie aucun accès."
              : "Un niveau à surveiller peut notamment correspondre à une désactivation de membre, un rendez-vous refusé ou annulé, ou une confirmation d'identité échouée. C'est une alerte automatique du système, elle ne modifie aucun accès."}
          </p>
        )}

        <Section C={C} titre="Informations"><BlocLignes C={C} lignes={lignesGenerales}/></Section>

        {echanges.length > 0 && (
          <Section C={C} titre={clientNom ? `Échanges avec ${clientNom}` : "Échanges avec ce client"}>
            <ul role="list" style={{ listStyle: "none", margin: 0, backgroundColor: C.bg3, borderRadius: "10px", padding: "4px 12px" }}>
              {echanges.map((x, i) => (
                <li key={x.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 0", borderBottom: i < echanges.length - 1 ? `1px solid ${C.border}` : "none" }}>
                  <span style={{ color: C.t2, fontSize: "12px", width: "112px", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{dateCourteHeure(x.created_at)}</span>
                  <ClientBadge C={C} action={x.action}/>
                  <span style={{ fontSize: "12.5px", color: x.id === entree.id ? C.gold : C.t1, fontWeight: x.id === entree.id ? 700 : 500 }}>
                    {x.action === "message_recu" ? "A répondu" : "A écrit un message"}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {(entree.navigateur || entree.os || entree.ip || ipMasquee) && (
          <Section C={C} titre="Contexte"><BlocLignes C={C} lignes={lignesContexte}/></Section>
        )}

        {(entree.ancienne_valeur || entree.nouvelle_valeur) && (
          <Section C={C} titre="Modifications">
            <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {([["Avant", entree.ancienne_valeur], ["Après", entree.nouvelle_valeur]] as const).map(([titre, val]) => (
                <div key={titre} style={{ minWidth: 0 }}>
                  <div style={{ color: C.t2, fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>{titre}</div>
                  {Object.entries(val || {}).length === 0
                    ? <div style={{ color: C.t2, fontSize: "12.5px" }}>—</div>
                    : Object.entries(val || {}).map(([k, v]) => (
                        <div key={k} style={{ color: C.t1, fontSize: "12.5px", fontWeight: 600, marginBottom: "2px", overflowWrap: "anywhere" }}>
                          <span style={{ color: C.t2, fontWeight: 500 }}>{cleLisible(k)} : </span>{formaterValeur(v)}
                        </div>
                      ))}
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section C={C} titre="Activité voisine" sousTitre="Les 3 événements précédents et suivants de l'établissement">
          {contexteChargement ? (
            <div role="status" aria-label="Chargement" style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "20px", display: "flex", justifyContent: "center" }}><YelenLoader size={22}/></div>
          ) : voisins.length > 1 ? (
            <ul role="list" style={{ listStyle: "none", margin: 0, backgroundColor: C.bg3, borderRadius: "10px", padding: "4px 12px" }}>
              {voisins.map((x, i) => {
                const em = meta(x.action);
                const courant = x.id === entree.id;
                return (
                  <li key={x.id} aria-current={courant ? "true" : undefined} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 0", borderBottom: i < voisins.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    <span style={{ color: C.t2, fontSize: "12px", width: "112px", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{dateCourteHeure(x.created_at)}</span>
                    <Icon name={em.iconKey} size={13} color={em.couleur(C)}/>
                    <span style={{ fontSize: "12.5px", color: courant ? C.gold : C.t1, fontWeight: courant ? 700 : 500, flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                      <strong style={{ fontWeight: 600 }}>{x.membre_nom}</strong> · {libelleLigne(x)}
                    </span>
                    <ClientBadge C={C} action={x.action}/>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p style={{ color: C.t2, fontSize: "12.5px", margin: 0 }}>Aucun autre événement à proximité.</p>
          )}
        </Section>

        <div style={{ display: "flex", gap: "8px", marginTop: "18px", flexWrap: "wrap" }}>
          <Button tokens={toUiTokens(C)} className="jr-btn" variant="secondary" size="md" style={{ flex: "1 1 140px" }} icon={<Icon name="copy" size={14} color={C.t2}/>} onClick={() => onCopier(entree)}>Copier la référence</Button>
          <Button tokens={toUiTokens(C)} className="jr-btn" variant="secondary" size="md" style={{ flex: "1 1 140px" }} icon={<Icon name="share" size={14} color={C.t2}/>} onClick={() => onPartager(entree)}>Partager</Button>
          <Button tokens={toUiTokens(C)} className="jr-btn" variant="secondary" size="md" style={{ flex: "1 1 100px" }} onClick={onClose}>Fermer</Button>
        </div>
      </div>
    </div>
  );
}
