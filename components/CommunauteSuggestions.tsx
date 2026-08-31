"use client";

// Cartes interstitielles insérées entre les publications du fil Communauté
// (22/08/2026, retour Bryan, référence Facebook/LinkedIn : intercaler des
// suggestions entre les posts, mais dans des formats visuellement
// différents plutôt qu'un unique gabarit répété). Trois formats, chacun
// adossé à une donnée réelle déjà existante ailleurs dans le produit —
// aucune donnée de réputation citoyenne n'existe (audité avant de coder),
// donc "profils mieux notés" devient "établissements mieux notés"
// (institutions.moyenne_avis/nb_avis, déjà utilisé sur /compte/favoris) :
// 1. SuggestionRecommandations — liste de lignes (établissements pas
//    encore favoris, à découvrir), référence LinkedIn "Recommended for you".
// 2. SuggestionFavoris — grille 2 colonnes (rappel des favoris réels du
//    citoyen + prochain créneau, même donnée que /api/citoyen/favoris),
//    référence LinkedIn cartes "Connect" côte à côte.
// 3. SuggestionMieuxNotee — carte "spotlight" bandeau + logo, référence
//    LinkedIn "People skilled in X also follow".
import Image from "next/image";
import { SECTEUR_LABELS, SECTEUR_META } from "@/lib/institutionTaxonomy";

export type SuggestionInst = {
  id: string;
  name: string;
  secteur?: string;
  logo?: string;
  moyenne_avis?: number;
  nb_avis?: number;
  ville?: string;
};

export type SuggestionFavori = {
  institution_id: string;
  name: string;
  secteur: string | null;
  logo: string | null;
  prochain_creneau: { date_rdv: string; heure_rdv: string } | null;
};

function formatProchainCreneau(c: { date_rdv: string; heure_rdv: string } | null): string | null {
  if (!c) return null;
  const d = new Date(`${c.date_rdv}T${c.heure_rdv}:00`);
  const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);
  const jours = Math.round((d.getTime() - aujourdHui.getTime()) / (1000 * 60 * 60 * 24));
  const jourLabel = jours === 0 ? "aujourd'hui" : jours === 1 ? "demain" : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
  return `${jourLabel} à ${c.heure_rdv}`;
}

function Etoile({ note }: { note: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
      <svg width="12" height="12" viewBox="0 0 20 20" fill="#F5A623" stroke="#F5A623" strokeWidth="1"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 0 .95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 0-.364 1.118l1.07 3.292c.3.922-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 0 0-1.176 0l-2.8 2.034c-.783.57-1.838-.196-1.539-1.118l1.07-3.292a1 1 0 0 0-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81H7.03a1 1 0 0 0 .95-.69l1.07-3.292Z"/></svg>
      <span>{note.toFixed(1)}</span>
    </span>
  );
}

function LogoInst({ logo, nom, taille }: { logo?: string | null; nom: string; taille: number }) {
  return logo ? (
    <div style={{ position: "relative", width: taille, height: taille, borderRadius: "12px", overflow: "hidden", flexShrink: 0, background: "#f2f2f2" }}>
      <Image src={logo} alt={nom} fill sizes={`${taille}px`} style={{ objectFit: "cover" }} />
    </div>
  ) : (
    <div style={{ width: taille, height: taille, borderRadius: "12px", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", color: "#080812", fontWeight: 900, fontSize: taille * 0.38, flexShrink: 0 }}>
      {(nom || "Y").slice(0, 2).toUpperCase()}
    </div>
  );
}

export function SuggestionRecommandations({
  institutions, t1, t2, t3, card, brd, onVoir, onAjouterFavori, favorisEnCours,
}: {
  institutions: SuggestionInst[];
  t1: string; t2: string; t3: string; card: string; brd: string;
  onVoir: (id: string) => void;
  onAjouterFavori: (id: string) => void;
  favorisEnCours: Record<string, "ajout" | "ajoute">;
}) {
  if (institutions.length === 0) return null;
  return (
    <div style={{ background: card, border: `1px solid ${brd}`, borderRadius: "16px", padding: "16px" }}>
      <div style={{ color: t1, fontSize: "14px", fontWeight: 900, marginBottom: "6px" }}>Établissements à découvrir</div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {institutions.slice(0, 3).map((inst, idx) => {
          const etat = favorisEnCours[inst.id];
          const couleurSecteur = inst.secteur ? SECTEUR_META[inst.secteur]?.color : undefined;
          return (
            <div key={inst.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderTop: idx > 0 ? `1px solid ${brd}` : "none" }}>
              <button onClick={() => onVoir(inst.id)} className="tap" style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
                <LogoInst logo={inst.logo} nom={inst.name} taille={48} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: t1, fontSize: "13px", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inst.name}</div>
                  <div style={{ color: couleurSecteur || t2, fontSize: "11.5px", fontWeight: 700 }}>{inst.secteur ? (SECTEUR_LABELS[inst.secteur] || inst.secteur) : (inst.ville || "")}</div>
                  {typeof inst.moyenne_avis === "number" && inst.moyenne_avis > 0 && (
                    <div style={{ color: t3, fontSize: "11px", marginTop: "2px" }}><Etoile note={inst.moyenne_avis} /></div>
                  )}
                </div>
              </button>
              <button
                onClick={() => onAjouterFavori(inst.id)}
                disabled={!!etat}
                className="tap"
                style={{ flexShrink: 0, background: etat === "ajoute" ? "rgba(34,197,94,0.12)" : "none", border: `1.5px solid ${etat === "ajoute" ? "#22c55e" : "#F5A623"}`, borderRadius: "20px", padding: "7px 14px", color: etat === "ajoute" ? "#22c55e" : "#F5A623", fontSize: "12px", fontWeight: 800, cursor: etat ? "default" : "pointer" }}
              >
                {etat === "ajoute" ? "Ajouté" : "+ Favoris"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SuggestionFavoris({
  favoris, t1, t3, card, brd, isDark, onVoir,
}: {
  favoris: SuggestionFavori[];
  t1: string; t3: string; card: string; brd: string; isDark: boolean;
  onVoir: (id: string) => void;
}) {
  if (favoris.length === 0) return null;
  return (
    <div style={{ background: card, border: `1px solid ${brd}`, borderRadius: "16px", padding: "16px" }}>
      <div style={{ color: t1, fontSize: "14px", fontWeight: 900, marginBottom: "12px" }}>Vos favoris</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        {favoris.slice(0, 2).map(f => {
          const creneau = formatProchainCreneau(f.prochain_creneau);
          return (
            <button key={f.institution_id} onClick={() => onVoir(f.institution_id)} className="tap" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "8px", background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", border: `1px solid ${brd}`, borderRadius: "12px", padding: "12px", cursor: "pointer", textAlign: "left" }}>
              <LogoInst logo={f.logo} nom={f.name} taille={40} />
              <div style={{ color: t1, fontSize: "12.5px", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>{f.name}</div>
              <div style={{ color: creneau ? "#F5A623" : t3, fontSize: "11px", fontWeight: creneau ? 800 : 600 }}>
                {creneau ? `Créneau ${creneau}` : "Aucun créneau annoncé"}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SuggestionMieuxNotee({
  institution, t1, t2, card, brd, onVoir,
}: {
  institution: SuggestionInst;
  t1: string; t2: string; card: string; brd: string;
  onVoir: (id: string) => void;
}) {
  const couleurSecteur = (institution.secteur && SECTEUR_META[institution.secteur]?.color) || "#F5A623";
  return (
    <div style={{ background: card, border: `1px solid ${brd}`, borderRadius: "16px", overflow: "hidden" }}>
      <div style={{ color: t1, fontSize: "14px", fontWeight: 900, padding: "16px 16px 0" }}>Établissement du moment</div>
      <div style={{ height: "56px", background: `linear-gradient(120deg, ${couleurSecteur}, #080812)`, marginTop: "12px" }} />
      <div style={{ padding: "0 16px 16px" }}>
        <div style={{ marginTop: "-32px", marginBottom: "10px" }}>
          <div style={{ display: "inline-block", border: `3px solid ${card}`, borderRadius: "16px" }}>
            <LogoInst logo={institution.logo} nom={institution.name} taille={64} />
          </div>
        </div>
        <div style={{ color: t1, fontSize: "15px", fontWeight: 900, marginBottom: "2px" }}>{institution.name}</div>
        <div style={{ color: couleurSecteur, fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>
          {institution.secteur ? (SECTEUR_LABELS[institution.secteur] || institution.secteur) : ""}
        </div>
        {typeof institution.moyenne_avis === "number" && institution.moyenne_avis > 0 && (
          <div style={{ color: t2, fontSize: "12px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "4px" }}>
            <Etoile note={institution.moyenne_avis} /> <span>· {institution.nb_avis} avis</span>
          </div>
        )}
        <button onClick={() => onVoir(institution.id)} className="tap" style={{ width: "100%", background: "#F5A623", border: "none", borderRadius: "20px", padding: "11px", color: "#080812", fontSize: "13px", fontWeight: 800, cursor: "pointer" }}>
          Voir l&apos;établissement
        </button>
      </div>
    </div>
  );
}
