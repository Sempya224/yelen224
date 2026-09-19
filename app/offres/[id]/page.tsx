import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Image from "next/image";
import { headers } from "next/headers";
import { supabase } from "@/lib/supabase";
import { OFFRE_GENRE_LABELS, OFFRE_GENRE_COULEURS, type OffreGenre } from "@/lib/offresCategories";
import { APP_URL } from "@/lib/config";
import { detecterCanal } from "@/lib/canalAcquisition";
import { EcranContenuIntrouvable } from "@/components/EcranContenuIntrouvable";

type Fait = { label: string; valeur: string };

type OffrePublique = {
  titre: string;
  description_courte: string;
  description_longue: string;
  genre: string;
  partenaire_nom: string;
  partenaire_logo: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
  date_expiration: string | null;
  faits: Fait[] | null;
  avantages: string[] | null;
  limites: string[] | null;
};

const SELECT_FIELDS = "titre,description_courte,description_longue,genre,partenaire_nom,partenaire_logo,image_url,cta_label,cta_url,date_expiration,faits,avantages,limites";

async function getOffre(id: string): Promise<OffrePublique | null> {
  const { data } = await supabase
    .from("offres")
    .select(SELECT_FIELDS)
    .eq("id", id)
    .eq("statut", "publiee")
    .maybeSingle();
  return data ?? null;
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  const offre = await getOffre(id);

  if (!offre) {
    return {
      title: "Offre — Yelen224",
      description: "Découvrez les offres des prestataires partenaires sur Yelen224.",
    };
  }

  const title = `${offre.titre} — ${offre.partenaire_nom} · Yelen224`;
  const description = (offre.description_courte || offre.description_longue || "").trim().slice(0, 160);
  const url = `${APP_URL}/offres/${id}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "Yelen224",
      type: "website",
      locale: "fr_FR",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

function getInitials(nom: string): string {
  return nom.slice(0, 2).toUpperCase();
}

export default async function OffrePage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const offre = await getOffre(id);

  // Canal d'acquisition réel — dérivé du Referer HTTP au chargement de
  // cette page publique (seul point où l'origine du visiteur est
  // observable, cf. lib/canalAcquisition.ts). Vue comptée uniquement si
  // l'offre existe et est publiée (même garde que getOffre). Erreur
  // avalée volontairement, ne doit jamais empêcher l'affichage de la page.
  let canal: string = "autres";
  if (offre) {
    const h = await headers();
    canal = detecterCanal(h.get("referer"), APP_URL);
    await supabase.from("offre_vues").insert({ offre_id: id, citoyen_id: null, canal }).then(() => {}, () => {});
  }

  if (!offre) {
    return (
      <div style={pageStyle}>
        <style>{cssVars}</style>
        <EcranContenuIntrouvable
          pageBg="var(--bg)" text="var(--t1)" textSubtle="var(--t2)" border="var(--border)" cardBg="var(--card)"
          eyebrow="OFFRE INDISPONIBLE"
          title="Cette offre n'est plus disponible"
          message="Elle a peut-être expiré ou été retirée par l'institution."
          primaryHref="/" primaryLabel="Découvrir Yelen224"
        />
      </div>
    );
  }

  const genreCouleurs = OFFRE_GENRE_COULEURS[offre.genre as OffreGenre];
  const genreLabel = OFFRE_GENRE_LABELS[offre.genre as OffreGenre] || offre.genre;
  const faits = offre.faits || [];
  const avantages = offre.avantages || [];
  const limites = offre.limites || [];
  const descriptionLines = offre.description_longue.split("\n").map(l => l.trim()).filter(Boolean);

  return (
    <div style={pageStyle}>
      <style>{cssVars}</style>
      <main style={mainStyle}>
        {offre.image_url && (
          <div style={{ width: "100%", height: "220px", position: "relative", borderRadius: "16px", overflow: "hidden", marginBottom: "16px" }}>
            <Image src={offre.image_url} alt="" fill sizes="(min-width: 640px) 600px, 100vw" priority style={{ objectFit: "cover" }}/>
          </div>
        )}
        {genreCouleurs && (
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "inline-block", background: genreCouleurs.bg, color: genreCouleurs.texte, fontSize: "10.5px", fontWeight: 800, padding: "4px 11px", borderRadius: "20px", textTransform: "uppercase", letterSpacing: "0.3px" }}>
              {genreLabel}
            </span>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "18px" }}>
          <div style={{ width: "48px", height: "48px", position: "relative", borderRadius: "13px", flexShrink: 0, overflow: "hidden", background: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {offre.partenaire_logo ? (
              <Image src={offre.partenaire_logo} alt={offre.partenaire_nom} fill sizes="48px" style={{ objectFit: "cover" }} />
            ) : (
              <span style={{ color: "#F5A623", fontWeight: 900, fontSize: "16px" }}>{getInitials(offre.partenaire_nom)}</span>
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <span style={{ color: "var(--t1)", fontSize: "13px", fontWeight: 800 }}>{offre.partenaire_nom}</span>
            <div style={{ color: "var(--t1)", fontSize: "19px", fontWeight: 900, lineHeight: 1.2, letterSpacing: "-0.3px", marginTop: "2px" }}>{offre.titre}</div>
          </div>
        </div>

        <div style={{ background: "var(--card2)", border: "1px solid var(--border)", borderRadius: "16px", padding: "16px", marginBottom: "14px" }}>
          <div style={{ color: "var(--t2)", fontSize: "13px", lineHeight: 1.6 }}>{offre.description_courte}</div>
          {faits.length > 0 && (
            <>
              <div style={{ height: "1px", background: "var(--border)", margin: "14px 0 12px" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {faits.map((f, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                    <span style={{ color: "var(--t2)", fontSize: "13px" }}>{f.label}</span>
                    <span style={{ color: "var(--t1)", fontSize: "13px", fontWeight: 800 }}>{f.valeur}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {avantages.length > 0 && (
          <div style={{ marginBottom: "16px" }}>
            <div style={{ color: "var(--t1)", fontSize: "13.5px", fontWeight: 800, marginBottom: "10px" }}>Avantages</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {avantages.map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" style={{ marginTop: "2px", flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
                  <span style={{ color: "var(--t2)", fontSize: "13px", lineHeight: 1.5 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {limites.length > 0 && (
          <div style={{ marginBottom: "16px" }}>
            <div style={{ color: "var(--t1)", fontSize: "13.5px", fontWeight: 800, marginBottom: "10px" }}>Limites</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {limites.map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.2" strokeLinecap="round" style={{ marginTop: "2px", flexShrink: 0 }}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  <span style={{ color: "var(--t2)", fontSize: "13px", lineHeight: 1.5 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginBottom: "14px" }}>
          <div style={{ color: "var(--t1)", fontSize: "13.5px", fontWeight: 800, marginBottom: "8px" }}>Description de l&apos;offre</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {descriptionLines.map((line, i) => (
              <div key={i} style={{ display: "flex", gap: "8px" }}>
                <span style={{ color: "#F5A623" }}>•</span>
                <span style={{ color: "var(--t2)", fontSize: "13px", lineHeight: 1.6 }}>{line}</span>
              </div>
            ))}
          </div>
        </div>

        {offre.date_expiration && (
          <div style={{ color: "var(--t2)", fontSize: "12px", marginBottom: "10px" }}>
            Offre valable jusqu&apos;au {new Date(offre.date_expiration).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.
          </div>
        )}

        <div style={{ color: "var(--t2)", fontSize: "11.5px", lineHeight: 1.6, marginBottom: "90px" }}>
          Offre vérifiée par Yelen avant publication. En continuant, vous quittez Yelen pour le site de {offre.partenaire_nom}.
        </div>
      </main>

      {offre.cta_url && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "14px 20px calc(14px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)", background: "var(--card)" }}>
          <a
            href={`/api/offres/${id}/clic?canal=${encodeURIComponent(canal)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              width: "100%", maxWidth: "600px", margin: "0 auto", padding: "14px", borderRadius: "14px", textDecoration: "none", boxSizing: "border-box",
              background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812",
              fontWeight: 800, fontSize: "14px", boxShadow: "0 3px 10px rgba(245,166,35,0.2)",
            }}
          >
            {offre.cta_label || "Accéder à l'offre"}
          </a>
        </div>
      )}
    </div>
  );
}

const cssVars = `
  :root { --bg:#F5F5F8; --card:#FFFFFF; --card2:rgba(0,0,0,0.02); --t1:#0A0A12; --t2:#47475C; --border:rgba(10,10,18,0.08); }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#080812; --card:#0D0D1A; --card2:rgba(255,255,255,0.03); --t1:#ffffff; --t2:#9999B3; --border:rgba(255,255,255,0.07); }
  }
`;

const pageStyle: CSSProperties = { minHeight: "100vh", background: "var(--bg)" };
const mainStyle: CSSProperties = { maxWidth: "640px", margin: "0 auto", padding: "24px 20px 16px", boxSizing: "border-box" };
