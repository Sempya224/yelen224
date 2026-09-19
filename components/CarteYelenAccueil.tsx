"use client";

// Widget carte de l'accueil citoyen (retour Bryan 22/08/2026) — "on ne peut
// pas avoir 2 expériences" : réutilise la VRAIE Vue Carte de /recherche
// (components/CarteMap.tsx + CarteSheet/SheetSection déplacés dans
// app/recherche/shared.tsx pour cette raison précise), jamais une
// réimplémentation séparée. Remplace intégralement l'ancien
// components/CarteMapHome.tsx (tuiles CartoDB, pins colorés par catégorie
// cassée, getStatus() jamais fiable — voir CLAUDE.md /pieges-techniques),
// qui doit disparaître complètement de l'accueil.
//
// Deux modes, mêmes données/logique, seul le rendu diffère :
// - `plein=false` (aperçu 240px dans le scroll de l'accueil) : carte seule,
//   pas de sheet (n'aurait pas la place de fonctionner sur si peu de
//   hauteur) — juste un vrai rendu de la carte réelle.
// - `plein=true` (modale interne "Agrandir", ouverture instantanée, fermeture
//   par X côté app/page.tsx) : carte + sheet complets, strictement identiques
//   à /recherche (sections, prise en charge citoyen, favoris, fiche
//   flottante, "Rechercher dans cette zone").
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { YelenLoader } from "@/components/YelenLoader";
import { deriverTendancesCitoyen, type RdvPourTendance } from "@/lib/citoyenTendances";
import { type Institution, CarteSheet } from "@/app/recherche/shared";

const CarteMap = dynamic(() => import("@/components/CarteMap"), { ssr: false });

const SELECT_INSTITUTION = "id,name,category,secteur,ville,quartier,moyenne_avis,nb_avis,logo,banniere,badge_verifie,description,statut,adresse,latitude,longitude,phone,disponibilites,horaires,created_at,activite_categorie_id";

export function CarteYelenAccueil({ plein = false }: { plein?: boolean }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const C = T[theme] as typeof T["dark"];
  const t2 = isDark ? "#6E6E7A" : "#6C6C70";
  const iBrd = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";

  const [loading, setLoading] = useState(true);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [favorisInsts, setFavorisInsts] = useState<Institution[]>([]);
  const [citoyenId, setCitoyenId] = useState<string | null>(null);
  const [citoyenVille, setCitoyenVille] = useState<string | null>(null);
  const [tendances, setTendances] = useState<ReturnType<typeof deriverTendancesCitoyen> | null>(null);
  const [citoyenGeoloc, setCitoyenGeoloc] = useState<{ lat: number; lng: number } | null>(null);

  const [selectedCarteId, setSelectedCarteId] = useState<string | null>(null);
  const [zoneIds, setZoneIds] = useState<string[] | null>(null);
  const [pendingZoneIds, setPendingZoneIds] = useState<string[] | null>(null);

  // Même pattern permissif que RechercheInner.tsx (demande silencieuse,
  // aucune UI si refusé/indisponible).
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => setCitoyenGeoloc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { timeout: 8000 }
    );
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("institutions").select(SELECT_INSTITUTION).eq("statut", "validee").limit(150);
      setInstitutions((data || []) as Institution[]);
      setLoading(false);

      let id: string | null = null;
      try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
      if (!id) return;
      setCitoyenId(id);

      const { data: u } = await supabase.from("users").select("ville").eq("id", id).maybeSingle();
      setCitoyenVille((u?.ville || "").trim() || null);

      const { data: favRows } = await supabase.from("citoyen_favoris").select("institution_id").eq("citoyen_id", id);
      const favIds = (favRows || []).map((f: { institution_id: string }) => f.institution_id);
      if (favIds.length > 0) {
        const { data: favInsts } = await supabase.from("institutions").select(SELECT_INSTITUTION).in("id", favIds).eq("statut", "validee");
        setFavorisInsts((favInsts || []) as Institution[]);
      }

      // "Recommandé pour vous" — même moteur déterministe que
      // app/menu/vos-tendances (RechercheInner.tsx suit le même pattern).
      const { data: rdvRows } = await supabase.from("rdv").select("institution_id,date_rdv").eq("citoyen_id", id).order("date_rdv", { ascending: false }).limit(200);
      const instIds = [...new Set((rdvRows || []).map((r: { institution_id: string | null }) => r.institution_id).filter((v): v is string => !!v))];
      const secteurParId: Record<string, string | null> = {};
      const nomParId: Record<string, string> = {};
      if (instIds.length > 0) {
        const { data: instRows } = await supabase.from("institutions").select("id,name,secteur").in("id", instIds);
        (instRows || []).forEach((r: { id: string; name: string; secteur: string | null }) => { secteurParId[r.id] = r.secteur; nomParId[r.id] = r.name; });
      }
      const rdvPourTendance: RdvPourTendance[] = (rdvRows || []).map((r: { institution_id: string | null; date_rdv: string }) => ({
        institutionId: r.institution_id,
        institutionNom: r.institution_id ? (nomParId[r.institution_id] ?? null) : null,
        secteur: r.institution_id ? (secteurParId[r.institution_id] ?? null) : null,
        dateRdv: r.date_rdv,
      }));
      setTendances(deriverTendancesCitoyen(rdvPourTendance));
    })();
  }, []);

  const institutionsCarte = useMemo(() => institutions.filter(i => i.latitude && i.longitude), [institutions]);
  const institutionsCarteAffichees = useMemo(
    () => zoneIds === null ? institutionsCarte : institutionsCarte.filter(i => zoneIds.includes(i.id)),
    [institutionsCarte, zoneIds]
  );
  const favorisIdsSet = useMemo(() => new Set(favorisInsts.map(i => i.id)), [favorisInsts]);
  const selectedCarteInst = useMemo(() => institutionsCarteAffichees.find(i => i.id === selectedCarteId) ?? institutionsCarte.find(i => i.id === selectedCarteId) ?? null, [institutionsCarteAffichees, institutionsCarte, selectedCarteId]);

  const sheetRecommandees = useMemo(() => {
    if (!tendances?.suffisant || !tendances.secteurTop) return [];
    return institutionsCarte.filter(i => i.secteur === tendances.secteurTop);
  }, [institutionsCarte, tendances]);
  const sheetFavoris = useMemo(() => favorisInsts.filter(i => i.latitude && i.longitude), [favorisInsts]);
  const sheetPresDeChezVous = useMemo(() => {
    if (!citoyenVille) return [];
    return institutionsCarte.filter(i => i.ville === citoyenVille).sort((a, b) => (b.moyenne_avis || 0) - (a.moyenne_avis || 0));
  }, [institutionsCarte, citoyenVille]);
  const sheetVerifiees = useMemo(() => institutionsCarte.filter(i => i.badge_verifie).sort((a, b) => (b.moyenne_avis || 0) - (a.moyenne_avis || 0)), [institutionsCarte]);
  const sheetMieuxNotees = useMemo(() => institutionsCarte.filter(i => i.nb_avis > 0).sort((a, b) => (b.moyenne_avis || 0) - (a.moyenne_avis || 0)), [institutionsCarte]);
  const sheetNouvelles = useMemo(() => [...institutionsCarte].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")), [institutionsCarte]);

  function handleZoneChange(ids: string[], parUtilisateur: boolean) {
    if (!parUtilisateur) return;
    setPendingZoneIds(ids);
  }
  function appliquerZone() { setZoneIds(pendingZoneIds); setPendingZoneIds(null); }
  function reinitialiserZone() { setZoneIds(null); setPendingZoneIds(null); }

  const handleToggleFavoriCarte = useCallback(async (inst: Institution) => {
    if (!citoyenId) { window.location.href = "/inscription"; return; }
    const estFavori = favorisIdsSet.has(inst.id);
    if (estFavori) {
      setFavorisInsts(prev => prev.filter(i => i.id !== inst.id));
      const { error } = await supabase.from("citoyen_favoris").delete().eq("citoyen_id", citoyenId).eq("institution_id", inst.id);
      if (error) setFavorisInsts(prev => [...prev, inst]);
    } else {
      setFavorisInsts(prev => [...prev, inst]);
      const { error } = await supabase.from("citoyen_favoris").insert({ citoyen_id: citoyenId, institution_id: inst.id });
      if (error) setFavorisInsts(prev => prev.filter(i => i.id !== inst.id));
    }
  }, [citoyenId, favorisIdsSet]);

  if (loading) {
    return <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><YelenLoader size={plein ? 32 : 22}/></div>;
  }
  if (institutionsCarte.length === 0) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px", textAlign: "center" }}>
        <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.15)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "10px" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="1.5" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        </div>
        <div style={{ color: C.text, fontSize: "13px", fontWeight: "700" }}>Aucun établissement localisé pour l&apos;instant.</div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <CarteMap institutions={institutionsCarteAffichees} selectedId={selectedCarteId} onSelect={plein ? setSelectedCarteId : undefined} onZoneChange={plein ? handleZoneChange : undefined} citoyenGeoloc={citoyenGeoloc}/>

      {plein && (
        <>
          {pendingZoneIds !== null ? (
            <button onClick={appliquerZone} className="tap" style={{ position: "absolute", top: "14px", left: "50%", transform: "translateX(-50%)", zIndex: 900, backgroundColor: isDark ? "#0D0D1A" : "#fff", border: `1px solid ${iBrd}`, borderRadius: "20px", padding: "8px 16px", fontSize: "12px", fontWeight: "800", color: C.text, cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", gap: "6px" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              Rechercher dans cette zone
            </button>
          ) : zoneIds !== null && (
            <button onClick={reinitialiserZone} className="tap" style={{ position: "absolute", top: "14px", left: "50%", transform: "translateX(-50%)", zIndex: 900, backgroundColor: isDark ? "#0D0D1A" : "#fff", border: `1px solid ${iBrd}`, borderRadius: "20px", padding: "8px 16px", fontSize: "12px", fontWeight: "800", color: t2, cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", gap: "6px" }}>
              Toutes les zones
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}

          <CarteSheet
            rechercheActive={false}
            search=""
            selectedInst={selectedCarteInst}
            filteredInstitutions={institutionsCarteAffichees}
            sheetRecommandees={sheetRecommandees}
            secteurTopLabel={tendances?.secteurTopLabel ?? null}
            sheetFavoris={sheetFavoris}
            sheetPresDeChezVous={sheetPresDeChezVous}
            citoyenVille={citoyenVille}
            sheetVerifiees={sheetVerifiees}
            sheetMieuxNotees={sheetMieuxNotees}
            sheetNouvelles={sheetNouvelles}
            sansAucuneInstitution={institutionsCarte.length === 0}
            citoyenGeoloc={citoyenGeoloc}
            favorisIdsSet={favorisIdsSet}
            onToggleFavori={handleToggleFavoriCarte}
            onSelectInstitution={setSelectedCarteId}
            onDeselectInstitution={() => setSelectedCarteId(null)}
            mapAreaHeight={typeof window !== "undefined" ? window.innerHeight - 56 : 600}
            C={C}
            t2={t2}
            isDark={isDark}
          />
        </>
      )}
    </div>
  );
}
