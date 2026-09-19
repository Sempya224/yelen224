import { ImageResponse } from "next/og";
import { supabase } from "@/lib/supabase";
import { OFFRE_GENRE_LABELS, type OffreGenre } from "@/lib/offresCategories";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type OgRow = {
  titre: string;
  genre: string;
  partenaire_nom: string;
  partenaire_logo: string | null;
  image_url: string | null;
  statut: string | null;
};

async function getOgData(id: string): Promise<OgRow | null> {
  const { data } = await supabase
    .from("offres")
    .select("titre,genre,partenaire_nom,partenaire_logo,image_url,statut")
    .eq("id", id)
    .eq("statut", "publiee")
    .maybeSingle();
  return data ?? null;
}

// Même palette déterministe que app/page.tsx::offreGradient (dupliquée ici
// volontairement — petite fonction pure, éviter de toucher app/page.tsx
// pour ce chantier) : une offre n'a pas de couleur de marque stockée en
// base, donc une teinte est dérivée du nom du partenaire, toujours la même
// pour un même partenaire.
const OFFRE_PALETTE = [
  "linear-gradient(135deg,#F5A623,#C8740A)",
  "linear-gradient(135deg,#2563EB,#1E3A8A)",
  "linear-gradient(135deg,#DC2626,#7F1D1D)",
  "linear-gradient(135deg,#16A34A,#14532D)",
  "linear-gradient(135deg,#9333EA,#581C87)",
  "linear-gradient(135deg,#0D9488,#134E4A)",
];
function offreGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return OFFRE_PALETTE[h % OFFRE_PALETTE.length];
}

function getInitials(nom: string): string {
  return nom.slice(0, 2).toUpperCase();
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const offre = await getOgData(id);

  const titre = offre?.titre ?? "Yelen224";
  const partenaireNom = offre?.partenaire_nom ?? "Yelen224";
  const genreLabel = offre?.genre ? (OFFRE_GENRE_LABELS[offre.genre as OffreGenre] || offre.genre) : "Offre";
  const gradient = offreGradient(partenaireNom);
  const initials = getInitials(partenaireNom) || "Y";

  // Carte avec vraie photo — retour Bryan 04/08/2026 : priorité à
  // offre.image_url dès qu'elle existe, même overlay+CTA que la carte OG
  // institution (app/institution/[id]/opengraph-image.tsx). Repli sur la
  // carte gradient ci-dessous si aucune photo n'a été uploadée.
  const photoCard = (withLogo: boolean) => (
    <div style={{ width: "1200px", height: "630px", display: "flex", position: "relative", fontFamily: "sans-serif" }}>
      <img src={offre!.image_url!} width={1200} height={630} style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }}/>
      <div style={{ position: "absolute", top: 0, left: 0, width: "1200px", height: "630px", display: "flex", background: "linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.8) 100%)" }}/>
      <div style={{ position: "absolute", left: 60, right: 60, bottom: 50, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {withLogo && offre?.partenaire_logo ? (
            <img src={offre.partenaire_logo} width={80} height={80} style={{ borderRadius: 18, objectFit: "cover", border: "3px solid #F5A623" }}/>
          ) : (
            <div style={{ width: 80, height: 80, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", background: "#F5A623", color: "#000", fontSize: 30, fontWeight: 900 }}>{initials}</div>
          )}
          <span style={{ fontSize: 46, fontWeight: 800, color: "#fff", maxWidth: 950, lineHeight: 1.2 }}>{titre}</span>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <span style={{ display: "flex", background: "rgba(255,255,255,0.22)", color: "#fff", borderRadius: 999, padding: "8px 20px", fontSize: 22, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{genreLabel}</span>
          <span style={{ display: "flex", background: "#F5A623", color: "#080812", borderRadius: 12, padding: "10px 24px", fontSize: 22, fontWeight: 800 }}>Découvrir sur Yelen224</span>
        </div>
      </div>
    </div>
  );

  const card = (withLogo: boolean) => (
    <div style={{ width: "1200px", height: "630px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22, background: gradient, fontFamily: "sans-serif" }}>
      {withLogo && offre?.partenaire_logo ? (
        <img src={offre.partenaire_logo} width={150} height={150} style={{ borderRadius: 32, objectFit: "cover", border: "6px solid rgba(255,255,255,0.9)" }} />
      ) : (
        <div style={{ width: 150, height: 150, borderRadius: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.2)", border: "6px solid rgba(255,255,255,0.9)", color: "#fff", fontSize: 54, fontWeight: 900 }}>
          {initials}
        </div>
      )}
      <span style={{ fontSize: 50, fontWeight: 800, color: "#fff", textAlign: "center", maxWidth: 1000, lineHeight: 1.2 }}>{titre}</span>
      <span style={{ display: "flex", background: "rgba(255,255,255,0.22)", color: "#fff", borderRadius: 999, padding: "8px 22px", fontSize: 24, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{genreLabel}</span>
      <span style={{ display: "flex", background: "#F5A623", color: "#080812", borderRadius: 12, padding: "12px 28px", fontSize: 24, fontWeight: 800, marginTop: 8 }}>Découvrir sur Yelen224</span>
    </div>
  );

  if (offre?.image_url) {
    try {
      return new ImageResponse(photoCard(true), { ...size });
    } catch {
      // Photo injoignable/invalide : repli sur la carte gradient ci-dessous
      // plutôt que de casser la génération.
    }
  }

  try {
    return new ImageResponse(card(true), { ...size });
  } catch {
    // Logo partenaire injoignable/invalide : dernier repli garanti sans
    // aucune image externe (juste les initiales), ne peut pas échouer.
    return new ImageResponse(card(false), { ...size });
  }
}
