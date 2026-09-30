"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { YelenLoader } from "@/components/YelenLoader";
import { VILLES_GUINEE } from "@/lib/villes";
import { ACTIVITE_CATEGORIE_SHORT } from "@/lib/activiteVisuels";
import { CarteInstitutionCard, type Institution, type CategorieById } from "@/app/recherche/shared";
import { CategorieGrid } from "../CategorieGrid";

// "Yelen vous accompagne" — parcours d'orientation (brief CEO 27/09/2026,
// Lot A, voir CLAUDE.md pour le contexte complet et le lot B explicitement
// hors scope). Profondeur fixe, aucune question inventée par sous-besoin :
// catégorie et activités réelles (activite_categories/activites), ville
// réelle (lib/villes.ts), délai générique. Matching réutilise le même
// schéma que app/recherche/RechercheInner.tsx (institutions.activite_categorie_id,
// statut='validee') + resserrage optionnel sur institution_activites avec
// repli silencieux sur la catégorie si 0 résultat précis. Résultats
// affichés avec CarteInstitutionCard (app/recherche/shared.tsx), CTA
// "Prendre rendez-vous" déjà calculé par ce composant (jamais réinventé).
//
// Retour Bryan 28/09/2026 : chaque étape est une question à réponse unique
// — taper une réponse fait avancer automatiquement, aucun bouton "Suivant"
// nulle part sauf sur l'étape Vérification (seule étape à récapituler
// plusieurs réponses à la fois et à nécessiter un choix explicite de
// continuer). D'où la scission de l'ancienne étape "contexte" combinée
// (ville + délai + note en une seule fois) en deux étapes à réponse unique
// (ville, délai) — la note libre, elle, n'a pas de "réponse unique"
// possible, elle vit donc sur l'étape Vérification (seule à accepter des
// champs libres).

type Etape = "categorie" | "activite" | "ville" | "delai" | "verification" | "resultats";
type ActiviteOption = { id: string; label: string };
type Delai = "des_que_possible" | "cette_semaine" | "ce_mois" | "je_regarde";
const DELAIS: { val: Delai; label: string }[] = [
  { val: "des_que_possible", label: "Dès que possible" },
  { val: "cette_semaine", label: "Cette semaine" },
  { val: "ce_mois", label: "Ce mois-ci" },
  { val: "je_regarde", label: "Je regarde seulement" },
];
const ETAPES_ORDRE: Etape[] = ["categorie", "activite", "ville", "delai", "verification", "resultats"];
const TITRE_ETAPE: Record<Etape, string> = {
  categorie: "Catégorie", activite: "Votre besoin", ville: "Ville", delai: "Délai", verification: "Vérification", resultats: "Résultats",
};

const P = { pointerEvents: "none" as const };
const Ic = {
  X:    () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Chev: () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m9 6 6 6-6 6"/></svg>,
};

// Ligne à réponse unique — tap = réponse + avance directement à l'étape
// suivante, jamais de bouton "Suivant" séparé (retour Bryan 28/09/2026).
function LigneChoix({ label, actif, onClick, isDark, t1, t2, t3, brd }: {
  label: string; actif: boolean; onClick: () => void;
  isDark: boolean; t1: string; t2: string; t3: string; brd: string;
}) {
  return (
    <button onClick={onClick} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "14px 16px", background: "none", border: "none", borderBottom: `1px solid ${brd}`, cursor: "pointer", textAlign: "left" }}>
      <span style={{ color: t1, fontSize: "14px", fontWeight: 600 }}>{label}</span>
      <span style={{ color: actif ? "#F5A623" : t3, flexShrink: 0, display: "flex" }}><Ic.Chev/></span>
    </button>
  );
}

export function AccompagnementClient() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const C = T[theme];
  const bg = isDark ? "#0A0A0F" : "#F2F2F7";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1 = isDark ? "#FFFFFF" : "#000000";
  const t2 = isDark ? "#8E8E93" : "#6C6C70";
  const t3 = isDark ? "#636366" : "#AEAEB2";
  const brd = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const ombreCard = isDark ? "none" : "0 1px 4px rgba(0,0,0,0.04)";
  const inputBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";

  const [citoyenId, setCitoyenId] = useState<string | null>(null);
  const [favorisIds, setFavorisIds] = useState<Set<string>>(new Set());

  const [etape, setEtape] = useState<Etape>("categorie");
  const [categorieCode, setCategorieCode] = useState<string | null>(null);
  const [categorieId, setCategorieId] = useState<string | null>(null);
  const [activites, setActivites] = useState<ActiviteOption[]>([]);
  const [loadingActivites, setLoadingActivites] = useState(false);
  const [activiteId, setActiviteId] = useState<string | "autre" | null>(null);
  const [ville, setVille] = useState("");
  const [delai, setDelai] = useState<Delai | null>(null);
  const [note, setNote] = useState("");
  const [resultats, setResultats] = useState<Institution[] | null>(null);
  const [rechercheEnCours, setRechercheEnCours] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      setCitoyenId(session.user.id);
      const { data } = await supabase.from("citoyen_favoris").select("institution_id").eq("citoyen_id", session.user.id);
      setFavorisIds(new Set((data ?? []).map((f) => f.institution_id)));
    })();
  }, []);

  async function toggleFavori(inst: Institution) {
    if (!citoyenId) return;
    const estFavori = favorisIds.has(inst.id);
    setFavorisIds((prev) => { const next = new Set(prev); if (estFavori) next.delete(inst.id); else next.add(inst.id); return next; });
    if (estFavori) await supabase.from("citoyen_favoris").delete().eq("citoyen_id", citoyenId).eq("institution_id", inst.id);
    else await supabase.from("citoyen_favoris").insert({ citoyen_id: citoyenId, institution_id: inst.id });
  }

  async function choisirCategorie(code: string) {
    setCategorieCode(code);
    setActiviteId(null);
    setLoadingActivites(true);
    const { data: cat } = await supabase.from("activite_categories").select("id").eq("code", code).maybeSingle();
    setCategorieId(cat?.id ?? null);
    if (cat?.id) {
      const { data } = await supabase.from("activites").select("id,label").eq("categorie_id", cat.id).eq("statut", "active").order("ordre");
      setActivites((data as ActiviteOption[]) ?? []);
    } else {
      setActivites([]);
    }
    setLoadingActivites(false);
    setEtape("activite");
  }

  function choisirActivite(val: string) {
    setActiviteId(val);
    setEtape("ville");
  }

  function choisirVille(v: string) {
    setVille(v);
    setEtape("delai");
  }

  function choisirDelai(d: Delai) {
    setDelai(d);
    setEtape("verification");
  }

  async function lancerRecherche(sansVille = false) {
    setEtape("resultats");
    setRechercheEnCours(true);
    let query = supabase
      .from("institutions")
      .select("id,name,category,secteur,ville,quartier,moyenne_avis,nb_avis,logo,banniere,badge_verifie,description,statut,adresse,latitude,longitude,phone,disponibilites,horaires,activite_categorie_id,services,website,whatsapp,statut_juridique")
      .eq("statut", "validee");
    if (categorieId) query = query.eq("activite_categorie_id", categorieId);
    if (ville && !sansVille) query = query.ilike("ville", `%${ville}%`);
    const { data } = await query.limit(60);
    let results = (data ?? []) as Institution[];

    // Resserrage sur l'activité précise choisie — institution_activites est
    // réellement peuplée à l'inscription (principale obligatoire, voir
    // app/api/institution/auth/register/route.ts), mais reste plus fine que
    // le simple activite_categorie_id : repli silencieux sur la catégorie
    // si ça ne donne aucun résultat plutôt qu'un 0 sec.
    if (activiteId && activiteId !== "autre" && results.length > 0) {
      const { data: matches } = await supabase.from("institution_activites").select("institution_id").eq("activite_id", activiteId);
      const idsMatch = new Set((matches ?? []).map((m) => m.institution_id));
      const resserres = results.filter((r) => idsMatch.has(r.id));
      if (resserres.length > 0) results = resserres;
    }

    if (results.length > 0) {
      const { data: paidRows } = await supabase.from("paid_services").select("institution_id").in("institution_id", results.map((r) => r.id)).eq("is_active", true);
      const comptes = new Map<string, number>();
      for (const p of paidRows ?? []) comptes.set(p.institution_id, (comptes.get(p.institution_id) ?? 0) + 1);
      results = results.map((r) => ({ ...r, paid_services_actifs: comptes.get(r.id) ?? 0 }));
    }

    setResultats(results);
    setRechercheEnCours(false);
  }

  function elargirRecherche() {
    setVille("");
    void lancerRecherche(true);
  }

  const activiteLabel = activiteId === "autre" ? "Autre besoin" : activites.find((a) => a.id === activiteId)?.label ?? null;
  const categorieLabel = categorieCode ? ACTIVITE_CATEGORIE_SHORT[categorieCode] ?? categorieCode : null;
  const delaiLabel = DELAIS.find((d) => d.val === delai)?.label ?? null;

  const categorieByIdMap = useMemo<CategorieById>(() => (
    categorieId && categorieCode ? { [categorieId]: { code: categorieCode, label: categorieLabel ?? categorieCode } } : {}
  ), [categorieId, categorieCode, categorieLabel]);

  function retourEtape() {
    if (etape === "categorie") { router.push("/menu/projets"); return; }
    if (etape === "activite") setEtape("categorie");
    else if (etape === "ville") setEtape("activite");
    else if (etape === "delai") setEtape("ville");
    else if (etape === "verification") setEtape("delai");
    else setEtape("verification");
  }

  // Relais vers "Mes projets" (Lot 2) — le délai choisi ici est la seule
  // donnée de ce parcours qui porte une notion d'urgence réelle, mappée
  // directement sur l'échelle priorite de citoyen_projets plutôt que
  // d'inventer une nouvelle question : "Dès que possible" = urgente,
  // "Cette semaine" = importante, le reste reste 'normale' (silencieux).
  function organiserDansProjets() {
    const titre = activiteLabel ?? categorieLabel ?? "";
    const priorite = delai === "des_que_possible" ? "urgente" : delai === "cette_semaine" ? "importante" : "normale";
    const params = new URLSearchParams();
    if (categorieCode) params.set("secteur", categorieCode);
    if (titre) params.set("titre", titre);
    if (activiteLabel) params.set("besoin", activiteLabel);
    if (ville) params.set("lieu", ville);
    params.set("priorite", priorite);
    if (note.trim()) params.set("description", note.trim());
    router.push(`/menu/projets?${params.toString()}`);
  }

  const progressionPct = ((ETAPES_ORDRE.indexOf(etape) + 1) / ETAPES_ORDRE.length) * 100;
  const boutonStyle: React.CSSProperties = { width: "100%", padding: "15px", borderRadius: "16px", border: "none", backgroundColor: "#F5A623", color: "#080812", fontSize: "14.5px", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
  const boutonSecondaireStyle: React.CSSProperties = { ...boutonStyle, background: card, border: `1px solid ${brd}`, color: t1 };

  const recap: [string, string][] = [
    ["Besoin", activiteLabel ?? "Non précisé"],
    ["Catégorie", categorieLabel ?? "Non précisée"],
    ["Lieu", ville || "Toute la Guinée"],
    ["Délai souhaité", delaiLabel ?? "Non précisé"],
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: bg, overflowY: "auto", overflowX: "hidden" }}>
      <style>{`.tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}.tap:active{opacity:0.65;transform:scale(0.97)}`}</style>
      <header style={{ position: "sticky", top: 0, zIndex: 10, background: bg, borderBottom: `1px solid ${brd}`, padding: "env(safe-area-inset-top) 16px 0" }}>
        <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
          <button onClick={retourEtape} className="tap" aria-label={etape === "categorie" ? "Fermer" : "Retour"} style={{ justifySelf: "start", width: "36px", height: "36px", borderRadius: "9px", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}><Ic.X/></button>
          <div style={{ color: t1, fontSize: "14px", fontWeight: 800 }}>{TITRE_ETAPE[etape]}</div>
          <div/>
        </div>
        <div style={{ height: "3px", background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }}>
          <div style={{ height: "100%", width: `${progressionPct}%`, background: "#F5A623", transition: "width 0.2s ease" }}/>
        </div>
      </header>

      <div style={{ padding: "20px 20px calc(env(safe-area-inset-bottom) + 32px)", maxWidth: "560px", margin: "0 auto" }}>
        {etape === "categorie" && (
          <>
            <div style={{ color: t1, fontSize: "16px", fontWeight: 800, marginBottom: "4px" }}>Commençons par comprendre votre besoin</div>
            <div style={{ color: t2, fontSize: "12.5px", marginBottom: "18px" }}>Que souhaitez-vous faire ?</div>
            <CategorieGrid onSelect={(code) => void choisirCategorie(code)} card={card} brd={brd} t1={t1} t2={t2} ombreCard={ombreCard}/>
          </>
        )}

        {etape === "activite" && (
          <>
            <div style={{ color: t1, fontSize: "16px", fontWeight: 800, marginBottom: "4px" }}>Que souhaitez-vous faire précisément ?</div>
            <div style={{ color: t2, fontSize: "12.5px", marginBottom: "18px" }}>Catégorie : {categorieLabel}</div>
            {loadingActivites ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}><YelenLoader size={22} color="#F5A623"/></div>
            ) : (
              <div style={{ background: card, borderRadius: "16px", overflow: "hidden", boxShadow: ombreCard }}>
                {activites.map((a) => (
                  <LigneChoix key={a.id} label={a.label} actif={activiteId === a.id} onClick={() => choisirActivite(a.id)} isDark={isDark} t1={t1} t2={t2} t3={t3} brd={brd}/>
                ))}
                <button onClick={() => choisirActivite("autre")} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "14px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ color: t1, fontSize: "14px", fontWeight: 600 }}>Autre / je ne sais pas précisément</span>
                  <span style={{ color: t3, flexShrink: 0, display: "flex" }}><Ic.Chev/></span>
                </button>
              </div>
            )}
          </>
        )}

        {etape === "ville" && (
          <>
            <div style={{ color: t1, fontSize: "16px", fontWeight: 800, marginBottom: "4px" }}>Dans quelle ville ?</div>
            <div style={{ color: t2, fontSize: "12.5px", marginBottom: "18px" }}>Pour trouver des professionnels près de chez vous</div>
            <div style={{ background: card, borderRadius: "16px", overflow: "hidden", boxShadow: ombreCard, maxHeight: "60vh", overflowY: "auto" }}>
              <LigneChoix label="Toute la Guinée" actif={ville === ""} onClick={() => choisirVille("")} isDark={isDark} t1={t1} t2={t2} t3={t3} brd={brd}/>
              {VILLES_GUINEE.map((v) => (
                <LigneChoix key={v} label={v} actif={ville === v} onClick={() => choisirVille(v)} isDark={isDark} t1={t1} t2={t2} t3={t3} brd={brd}/>
              ))}
            </div>
          </>
        )}

        {etape === "delai" && (
          <>
            <div style={{ color: t1, fontSize: "16px", fontWeight: 800, marginBottom: "18px" }}>Quand souhaitez-vous effectuer cette démarche ?</div>
            <div style={{ background: card, borderRadius: "16px", overflow: "hidden", boxShadow: ombreCard }}>
              {DELAIS.map((d) => (
                <LigneChoix key={d.val} label={d.label} actif={delai === d.val} onClick={() => choisirDelai(d.val)} isDark={isDark} t1={t1} t2={t2} t3={t3} brd={brd}/>
              ))}
            </div>
          </>
        )}

        {etape === "verification" && (
          <>
            <div style={{ color: t1, fontSize: "16px", fontWeight: 800, marginBottom: "4px" }}>Voici ce que j&apos;ai compris</div>
            <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.5, marginBottom: "18px" }}>
              Vous souhaitez {activiteLabel ? activiteLabel.toLowerCase() : "avancer sur ce besoin"}{ville ? ` à ${ville}` : ""}.
            </div>

            <div style={{ background: card, borderRadius: "16px", boxShadow: ombreCard, overflow: "hidden", marginBottom: "18px" }}>
              {recap.map(([label, valeur]) => (
                <div key={label} style={{ padding: "12px 16px", borderBottom: `1px solid ${brd}` }}>
                  <div style={{ color: t2, fontSize: "11px", fontWeight: 700, marginBottom: "3px" }}>{label}</div>
                  <div style={{ color: t1, fontSize: "13.5px", fontWeight: 600 }}>{valeur}</div>
                </div>
              ))}
            </div>

            <div style={{ color: t2, fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>Précisions supplémentaires (optionnel)</div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Toute information utile pour bien comprendre votre besoin" style={{ width: "100%", padding: "14px 16px", borderRadius: "14px", border: "none", backgroundColor: inputBg, color: t1, fontSize: "14px", fontFamily: "inherit", boxSizing: "border-box", resize: "none", marginBottom: "22px" }}/>

            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => setEtape("categorie")} className="tap" style={{ flex: 1, padding: "13px", borderRadius: "14px", border: `1px solid ${brd}`, background: "transparent", color: t1, fontWeight: 700, fontSize: "13.5px", cursor: "pointer" }}>Modifier</button>
              <button onClick={() => void lancerRecherche()} className="tap" style={{ ...boutonStyle, flex: 1.4 }}>Vérifier</button>
            </div>
          </>
        )}

        {etape === "resultats" && (
          rechercheEnCours ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><YelenLoader size={24} color="#F5A623"/></div>
          ) : resultats && resultats.length > 0 ? (
            <>
              <div style={{ color: t1, fontSize: "16px", fontWeight: 800, marginBottom: "4px" }}>Nous avons trouvé des professionnels pour vous</div>
              <div style={{ color: t2, fontSize: "12.5px", marginBottom: "18px" }}>{resultats.length} résultat{resultats.length > 1 ? "s" : ""}{ville ? ` à ${ville}` : ""}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {resultats.map((inst) => (
                  <CarteInstitutionCard key={inst.id} inst={inst} C={C} t2={t2} citoyenGeoloc={null} estFavori={favorisIds.has(inst.id)} onToggleFavori={(e) => { e.stopPropagation(); void toggleFavori(inst); }} onSelect={() => router.push(`/institution/${inst.id}?source=yelen_accompagnement`)} categorieById={categorieByIdMap}/>
                ))}
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
                <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "rgba(245,166,35,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                </div>
              </div>
              <div style={{ color: t1, fontSize: "15px", fontWeight: 800, textAlign: "center", marginBottom: "6px" }}>Aucun professionnel disponible pour le moment</div>
              <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.5, textAlign: "center", marginBottom: "22px" }}>
                Nous n&apos;avons pas trouvé de professionnel correspondant à ce besoin{ville ? ` à ${ville}` : ""} pour l&apos;instant.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
                {ville && <button onClick={elargirRecherche} className="tap" style={boutonSecondaireStyle}>Élargir ma recherche à toute la Guinée</button>}
                <button onClick={() => setEtape("categorie")} className="tap" style={boutonSecondaireStyle}>Modifier mon besoin</button>
                <button onClick={() => router.push(`/recherche${categorieCode ? `?categorie=${categorieCode}` : ""}`)} className="tap" style={boutonSecondaireStyle}>Voir les professionnels disponibles</button>
                <button onClick={organiserDansProjets} className="tap" style={boutonStyle}>Organiser ce besoin dans Mes projets</button>
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}
