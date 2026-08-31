import { ImageResponse } from "next/og";
import { supabase } from "@/lib/supabase";
import { SECTEUR_LABELS, SECTEUR_META } from "@/lib/institutionTaxonomy";
import { extraireIdDepuisParamInstitution } from "@/lib/institutionSlug";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type OgRow = {
  name: string;
  secteur: string | null;
  category: string | null;
  logo: string | null;
  banniere: string | null;
  badge_verifie: boolean;
  statut: string | null;
};

async function getOgData(id: string): Promise<OgRow | null> {
  const { data } = await supabase
    .from("institutions")
    .select("name,secteur,category,logo,banniere,badge_verifie,statut")
    .eq("id", id)
    .eq("statut", "validee")
    .maybeSingle();
  return data ?? null;
}

function getInitials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

const GOLD = "#F5A623";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawParam } = await params;
  const id = extraireIdDepuisParamInstitution(rawParam);
  const inst = id ? await getOgData(id) : null;

  const name = inst?.name ?? "Yelen224";
  const secteurLabel = inst?.secteur ? SECTEUR_LABELS[inst.secteur] : (inst?.category ?? "Prestataire");
  const secteurColor = inst?.secteur ? (SECTEUR_META[inst.secteur]?.color ?? GOLD) : GOLD;
  const initials = getInitials(name) || "Y";

  if (inst?.banniere) {
    try {
      return new ImageResponse(
        (
          <div style={{ width: "1200px", height: "630px", display: "flex", position: "relative", fontFamily: "sans-serif" }}>
            <img src={inst.banniere} width={1200} height={630} style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }} />
            <div style={{ position: "absolute", top: 0, left: 0, width: "1200px", height: "630px", display: "flex", background: "linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.75) 100%)" }} />
            <div style={{ position: "absolute", left: 60, right: 60, bottom: 50, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                {inst.logo ? (
                  <img src={inst.logo} width={92} height={92} style={{ borderRadius: 20, objectFit: "cover", border: `3px solid ${GOLD}` }} />
                ) : (
                  <div style={{ width: 92, height: 92, borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", background: GOLD, color: "#000", fontSize: 34, fontWeight: 900 }}>
                    {initials}
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 52, fontWeight: 800, color: "#fff", letterSpacing: -1 }}>{name}</span>
                    {inst.badge_verifie && (
                      <span style={{ display: "flex", background: "#22c55e", borderRadius: 999, padding: "6px 16px", color: "#fff", fontSize: 22, fontWeight: 700 }}>Vérifié</span>
                    )}
                  </div>
                  <span style={{ display: "flex", background: `${secteurColor}33`, border: `2px solid ${secteurColor}`, borderRadius: 999, padding: "6px 18px", color: "#fff", fontSize: 24, fontWeight: 700, width: "fit-content" }}>
                    {secteurLabel}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                <span style={{ display: "flex", background: GOLD, color: "#000", borderRadius: 12, padding: "12px 28px", fontSize: 26, fontWeight: 800 }}>Prendre rendez-vous sur Yelen224</span>
              </div>
            </div>
          </div>
        ),
        { ...size },
      );
    } catch {
      // Bannière injoignable/invalide (URL cassée, 404, timeout) : on tombe
      // dans le template doré ci-dessous plutôt que de casser la génération.
    }
  }

  const goldCard = (withLogo: boolean) => (
    <div style={{ width: "1200px", height: "630px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, background: `linear-gradient(135deg, ${GOLD} 0%, #C9791A 100%)`, fontFamily: "sans-serif" }}>
      {withLogo && inst?.logo ? (
        <img src={inst.logo} width={180} height={180} style={{ borderRadius: 36, objectFit: "cover", border: "6px solid rgba(255,255,255,0.85)" }} />
      ) : (
        <div style={{ width: 180, height: 180, borderRadius: 36, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.18)", border: "6px solid rgba(255,255,255,0.85)", color: "#fff", fontSize: 64, fontWeight: 900 }}>
          {initials}
        </div>
      )}
      <span style={{ fontSize: 58, fontWeight: 800, color: "#111", textAlign: "center", maxWidth: 1000 }}>{name}</span>
      <span style={{ display: "flex", background: "rgba(0,0,0,0.18)", color: "#fff", borderRadius: 999, padding: "10px 28px", fontSize: 26, fontWeight: 700 }}>{secteurLabel}</span>
    </div>
  );

  try {
    return new ImageResponse(goldCard(true), { ...size });
  } catch {
    // Logo institution injoignable/invalide : dernier repli garanti sans
    // aucune image externe (juste les initiales), ne peut pas échouer.
    return new ImageResponse(goldCard(false), { ...size });
  }
}
