"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import dynamic from "next/dynamic";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";

const CarteMap = dynamic(() => import("@/components/CarteMap"), { ssr: false });

type Institution = {
  id: string; name: string; category: string; ville: string; quartier: string;
  moyenne_avis: number; nb_avis: number; logo: string | null;
  badge_verifie: boolean; description: string | null; statut: string;
  adresse: string | null; latitude: number; longitude: number;
  phone: string | null; disponibilites: unknown;
  derniere_annonce?: { titre: string; type: string; contenu: string } | null;
};

const CAT_META: Record<string, { short: string; svgPath: string; gradient: string }> = {
  "Hopital / Clinique":      { gradient: "135deg,#F5A623,#C8740A", short: "Santé",      svgPath: "M12 5v14M5 12h14" },
  "Ecole / Universite":      { gradient: "135deg,#F5A623,#E8960A", short: "Éducation",  svgPath: "M12 3L2 9l10 6 10-6-10-6zM2 17l10 6 10-6" },
  "Mairie / Administration": { gradient: "135deg,#C8940A,#A87008", short: "Admin",      svgPath: "M3 21h18M4 21V10l8-7 8 7v11M9 21v-6h6v6" },
  "Banque / Microfinance":   { gradient: "135deg,#F5A623,#C8940A", short: "Banque",     svgPath: "M3 21h18M3 7h18M3 3h18v4H3zM9 11v10M15 11v10" },
  "Pharmacie":               { gradient: "135deg,#E8960A,#C8740A", short: "Pharmacie",  svgPath: "M12 2v20M2 12h20" },
  "Cabinet medical":         { gradient: "135deg,#F5A623,#E8960A", short: "Médecin",    svgPath: "M22 12h-4l-3 9L9 3l-3 9H2" },
  "Tribunal / Justice":      { gradient: "135deg,#C8940A,#F5A623", short: "Justice",    svgPath: "M12 3v18M3 9h18M3 15h18" },
  "Transport / Logistique":  { gradient: "135deg,#F5A623,#C8740A", short: "Transport",  svgPath: "M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v9a2 2 0 0 1-2 2h-3" },
  "ONG / Association":       { gradient: "135deg,#E8960A,#F5A623", short: "ONG",        svgPath: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
  "Autre":                   { gradient: "135deg,#F5A623,#C8940A", short: "Autre",      svgPath: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" },
};

const VILLES = ["Conakry","Boké","Kindia","Mamou","Labé","Faranah","Kankan","Nzérékoré"];
const SUGGESTIONS_BASE = ["Hôpital Donka","Banque de Guinée","Mairie de Conakry","École polytechnique","Clinique Pasteur","Tribunal de commerce","Pharmacie centrale"];

function InstitutionLogo({ inst, size = 64 }: { inst: Institution; size?: number }) {
  const [err, setErr] = useState(false);
  const meta = CAT_META[inst.category] || CAT_META["Autre"];
  const initials = inst.name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("");
  const r = Math.round(size * 0.22) + "px";
  if (inst.logo && !err) {
    return (
      <div style={{ width: size, height: size, borderRadius: r, overflow: "hidden", flexShrink: 0, border: "2px solid rgba(245,166,35,0.2)", boxShadow: "0 2px 12px rgba(245,166,35,0.12)" }}>
        <img src={inst.logo} alt={inst.name} onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: r, flexShrink: 0, background: `linear-gradient(${meta.gradient})`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px", boxShadow: "0 4px 14px rgba(245,166,35,0.2)", border: "1px solid rgba(245,166,35,0.15)" }}>
      <svg width={size * 0.38} height={size * 0.38} viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2" strokeLinecap="round">
        <path d={meta.svgPath}/>
      </svg>
      <span style={{ color: "#080812", fontSize: size * 0.15 + "px", fontWeight: "900" }}>{initials || meta.short.slice(0,3)}</span>
    </div>
  );
}

function Stars({ note, count }: { note: number; count: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
      {[1,2,3,4,5].map(s => (
        <svg key={s} width="10" height="10" viewBox="0 0 20 20" fill={s <= Math.round(note) ? "#F5A623" : "rgba(245,166,35,0.15)"}>
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 0 .95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 0-.364 1.118l1.07 3.292c.3.922-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 0 0-1.176 0l-2.8 2.034c-.783.57-1.838-.196-1.539-1.118l1.07-3.292a1 1 0 0 0-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81H7.03a1 1 0 0 0 .95-.69l1.07-3.292Z"/>
        </svg>
      ))}
      <span style={{ color: "#F5A623", fontSize: "10px", fontWeight: "700", marginLeft: "3px" }}>{note > 0 ? note.toFixed(1) : "—"}</span>
      {count > 0 && <span style={{ color: "rgba(245,166,35,0.5)", fontSize: "10px" }}>({count})</span>}
    </div>
  );
}

function CardGrille({ inst, C }: { inst: Institution; C: typeof T["dark"] }) {
  const meta = CAT_META[inst.category] || CAT_META["Autre"];
  const hasDispos = inst.disponibilites && (Array.isArray(inst.disponibilites) ? (inst.disponibilites as unknown[]).length > 0 : true);
  const txt2 = C.textSubtle;
  return (
    <a href={`/institution/${inst.id}`} style={{ textDecoration: "none", display: "flex", flexDirection: "column", background: C.cardBg, borderRadius: "16px", border: `1px solid ${C.borderCard}`, overflow: "hidden", position: "relative" }} className="inst-card">
      <div style={{ height: "3px", background: "linear-gradient(90deg,#F5A623,rgba(245,166,35,0.2))", flexShrink: 0 }}/>
      {inst.badge_verifie && (
        <div style={{ position: "absolute", top: "10px", right: "8px", display: "flex", alignItems: "center", gap: "3px", padding: "2px 7px", background: "rgba(245,166,35,0.12)", border: "1px solid rgba(245,166,35,0.3)", borderRadius: "20px" }}>
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          <span style={{ color: "#F5A623", fontSize: "8px", fontWeight: "800" }}>VÉRIFIÉ</span>
        </div>
      )}
      <div style={{ padding: "16px 12px 10px", display: "flex", justifyContent: "center" }}>
        <InstitutionLogo inst={inst} size={62}/>
      </div>
      <div style={{ padding: "0 10px 12px", flex: 1, display: "flex", flexDirection: "column", gap: "5px" }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <span style={{ background: "rgba(245,166,35,0.1)", color: "#F5A623", fontSize: "8px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px", letterSpacing: "0.5px", textTransform: "uppercase" }}>{meta.short}</span>
        </div>
        <div style={{ color: C.text, fontSize: "12px", fontWeight: "800", lineHeight: 1.3, textAlign: "center", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>{inst.name}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "3px" }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgba(245,166,35,0.5)" strokeWidth="2.5" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <span style={{ color: txt2, fontSize: "10px", fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "90%" }}>{inst.ville || "Guinée"}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}><Stars note={inst.moyenne_avis || 0} count={inst.nb_avis || 0}/></div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: hasDispos ? "#F5A623" : "rgba(255,255,255,0.1)" }}/>
          <span style={{ color: hasDispos ? "#F5A623" : txt2, fontSize: "9px", fontWeight: "700" }}>{hasDispos ? "Créneaux disponibles" : "Sur demande"}</span>
        </div>
        <div style={{ marginTop: "auto", paddingTop: "8px" }}>
          <div style={{ width: "100%", padding: "8px", background: "linear-gradient(135deg,#F5A623,#C8940A)", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", boxShadow: "0 4px 12px rgba(245,166,35,0.25)" }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span style={{ color: "#080812", fontSize: "10px", fontWeight: "900" }}>Prendre RDV</span>
          </div>
        </div>
      </div>
    </a>
  );
}

function SkeletonCard({ isDark }: { isDark: boolean }) {
  const bg = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
  return (
    <div style={{ background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", borderRadius: "16px", border: `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`, padding: "16px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
      <div style={{ width: "62px", height: "62px", borderRadius: "14px", background: bg }} className="skel"/>
      <div style={{ width: "55%", height: "9px", borderRadius: "5px", background: bg }} className="skel"/>
      <div style={{ width: "85%", height: "22px", borderRadius: "5px", background: bg }} className="skel"/>
      <div style={{ width: "50%", height: "8px", borderRadius: "5px", background: bg }} className="skel"/>
      <div style={{ width: "100%", height: "30px", borderRadius: "10px", background: bg }} className="skel"/>
    </div>
  );
}

function RechercheInner() {
  const { theme } = useTheme();
  const C = T[theme];
  const isDark = theme === "dark";
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const lastY = useRef(0);

  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [inputVal, setInputVal] = useState("");
  const [filterCat, setFilterCat] = useState(searchParams.get("categorie") || "");
  const [filterVille, setFilterVille] = useState(searchParams.get("region") || "");
  const [filterVerifie, setFilterVerifie] = useState(false);
  const [filterDispos, setFilterDispos] = useState(false);
  const [sortBy, setSortBy] = useState<"note"|"avis"|"nom">("note");
  const [total, setTotal] = useState(0);
  const [vue, setVue] = useState<"grille"|"liste"|"carte">("grille");
  const [showFilters, setShowFilters] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [heroVisible, setHeroVisible] = useState(true);
  const [page, setPage] = useState(0);
  const PER_PAGE = 20;

  useEffect(() => {
    const fn = () => {
      const y = window.scrollY;
      setHeroVisible(y < 80 || y < lastY.current);
      lastY.current = y;
    };
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const fetchInstitutions = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("institutions")
      .select("id,name,category,ville,quartier,moyenne_avis,nb_avis,logo,badge_verifie,description,statut,adresse,latitude,longitude,phone,disponibilites")
      .eq("statut", "validee");
    if (filterCat) query = query.eq("category", filterCat);
    if (filterVille) query = query.ilike("ville", `%${filterVille}%`);
    if (filterVerifie) query = query.eq("badge_verifie", true);
    if (search) query = query.ilike("name", `%${search}%`);
    const { data } = await query.limit(100);
    let results = (data || []) as Institution[];
    if (filterDispos) results = results.filter(r => r.disponibilites && (Array.isArray(r.disponibilites) ? (r.disponibilites as unknown[]).length > 0 : true));
    if (sortBy === "note") results.sort((a, b) => (b.moyenne_avis||0) - (a.moyenne_avis||0));
    else if (sortBy === "avis") results.sort((a, b) => (b.nb_avis||0) - (a.nb_avis||0));
    else results.sort((a, b) => (a.name||"").localeCompare(b.name||""));
    setInstitutions(results);
    setTotal(results.length);
    setPage(0);
    setLoading(false);
  }, [search, filterCat, filterVille, filterVerifie, filterDispos, sortBy]);

  useEffect(() => {
    const t = setTimeout(fetchInstitutions, 300);
    return () => clearTimeout(t);
  }, [fetchInstitutions]);

  const activeFilters = [filterCat, filterVille, filterVerifie, filterDispos].filter(Boolean).length;
  const visible = institutions.slice(0, (page + 1) * PER_PAGE);
  const hasMore = visible.length < institutions.length;
  const suggestions = SUGGESTIONS_BASE.filter(s => s.toLowerCase().includes(inputVal.toLowerCase()) && inputVal.length > 0);

  const iBg  = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const iBrd = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";
  const t2   = isDark ? "#6E6E7A" : "#6C6C70";

  return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif", color: C.text, overflowX: "hidden", paddingBottom: "40px" }}>
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        html,body{overflow-x:hidden;background:${C.pageBg}}
        ::-webkit-scrollbar{display:none}
        *{scrollbar-width:none}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes skel{0%,100%{opacity:0.4}50%{opacity:0.8}}
        .skel{animation:skel 1.6s ease infinite}
        .tap{transition:opacity .1s,transform .1s;cursor:pointer;touch-action:manipulation}
        .tap:active{opacity:.7;transform:scale(.97)}
        .inst-card{transition:transform 0.15s,box-shadow 0.15s}
        .inst-card:active{transform:scale(0.98);box-shadow:0 6px 24px rgba(245,166,35,0.15)}
        input::placeholder{color:${t2}}
        input:focus,select:focus{outline:none;border-color:rgba(245,166,35,0.4)!important;box-shadow:0 0 0 3px rgba(245,166,35,0.06)!important}
        select option{background:${isDark?"#0D0D1A":"#fff"};color:${C.text}}
        a{-webkit-tap-highlight-color:transparent}
        .no-scroll::-webkit-scrollbar{display:none}
      `}</style>

      {/* ══ HEADER ══ */}
      <header style={{ position: "sticky", top: 0, zIndex: 300, backgroundColor: isDark ? "rgba(8,8,15,0.98)" : "rgba(248,248,251,0.98)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", borderBottom: `1px solid ${isDark ? "rgba(245,166,35,0.1)" : "rgba(245,166,35,0.12)"}` }}>

        {/* Ligne logo + vues + compteur */}
        <div style={{ padding: "11px 16px", display: "flex", alignItems: "center", gap: "10px" }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none", flexShrink: 0 }}>
            <div style={{ width: "28px", height: "28px", background: "linear-gradient(135deg,#F5A623,#C8940A)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(245,166,35,0.3)" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.8" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>
            </div>
            <div style={{ lineHeight: 1 }}>
              <div style={{ fontSize: "12px", fontWeight: "900", color: C.text, letterSpacing: "0.4px" }}>YELEN224</div>
              <div style={{ fontSize: "7px", fontWeight: "700", color: "#F5A623", letterSpacing: "1.5px" }}>ANNUAIRE</div>
            </div>
          </a>

          <div style={{ flex: 1 }}/>

          {/* Toggle vue */}
          <div style={{ display: "flex", background: iBg, border: `1px solid ${iBrd}`, borderRadius: "10px", padding: "3px", gap: "2px" }}>
            {([
              { k: "grille", d: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" },
              { k: "liste",  d: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" },
              { k: "carte",  d: "M3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21M9 3v18M15 6v15" },
            ] as { k: "grille"|"liste"|"carte"; d: string }[]).map(v => (
              <button key={v.k} onClick={() => setVue(v.k)} className="tap" style={{ width: "28px", height: "24px", borderRadius: "6px", border: "none", background: vue === v.k ? "#F5A623" : "transparent", color: vue === v.k ? "#080812" : t2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d={v.d}/></svg>
              </button>
            ))}
          </div>

          {!loading && (
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ color: "#F5A623", fontSize: "13px", fontWeight: "900", lineHeight: 1 }}>{total}</div>
              <div style={{ color: t2, fontSize: "8px", fontWeight: "600" }}>résultats</div>
            </div>
          )}
        </div>

        {/* Barre recherche + suggestions */}
        <div style={{ padding: "0 16px 10px", position: "relative" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            <div style={{ flex: 1, position: "relative" }}>
              <div style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#F5A623" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              </div>
              <input
                ref={inputRef}
                type="text"
                placeholder="Institution, service, ville…"
                value={inputVal}
                onChange={e => { setInputVal(e.target.value); setShowSuggestions(e.target.value.length > 0); }}
                onKeyDown={e => {
                  if (e.key === "Enter") { setSearch(inputVal); setShowSuggestions(false); }
                  if (e.key === "Escape") { setShowSuggestions(false); }
                }}
                onFocus={() => { if (inputVal.length > 0) setShowSuggestions(true); }}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                style={{ width: "100%", padding: "10px 36px 10px 36px", background: iBg, border: `1px solid ${iBrd}`, borderRadius: "12px", fontSize: "14px", color: C.text, fontWeight: "500" }}
              />
              {inputVal && (
                <button onClick={() => { setInputVal(""); setSearch(""); setShowSuggestions(false); }} style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: t2, cursor: "pointer", display: "flex", padding: "2px" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
            <button onClick={() => setShowFilters(f => !f)} className="tap" style={{ width: "42px", height: "40px", borderRadius: "12px", flexShrink: 0, background: activeFilters > 0 ? "linear-gradient(135deg,#F5A623,#C8940A)" : iBg, border: activeFilters > 0 ? "none" : `1px solid ${iBrd}`, color: activeFilters > 0 ? "#080812" : t2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative", boxShadow: activeFilters > 0 ? "0 4px 12px rgba(245,166,35,0.3)" : "none" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="12" y1="18" x2="12" y2="18"/></svg>
              {activeFilters > 0 && <span style={{ position: "absolute", top: "-4px", right: "-4px", width: "15px", height: "15px", borderRadius: "50%", background: "#080812", color: "#F5A623", fontSize: "8px", fontWeight: "900", display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${C.pageBg}` }}>{activeFilters}</span>}
            </button>
          </div>

          {/* Suggestions dropdown */}
          {showSuggestions && (suggestions.length > 0 || inputVal.length > 1) && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: "16px", right: "74px", background: isDark ? "#0D0D1A" : "#fff", border: `1px solid ${iBrd}`, borderRadius: "12px", overflow: "hidden", zIndex: 500, boxShadow: isDark ? "0 16px 40px rgba(0,0,0,0.6)" : "0 8px 24px rgba(0,0,0,0.12)", animation: "slideDown 0.15s ease" }}>
              {suggestions.map(s => (
                <button key={s} onMouseDown={() => { setInputVal(s); setSearch(s); setShowSuggestions(false); }} style={{ width: "100%", padding: "11px 14px", background: "none", border: "none", borderBottom: `1px solid ${iBrd}`, cursor: "pointer", textAlign: "left", color: C.text, fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "10px" }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  {s}
                </button>
              ))}
              <button onMouseDown={() => { setSearch(inputVal); setShowSuggestions(false); }} style={{ width: "100%", padding: "10px 14px", background: "rgba(245,166,35,0.05)", border: "none", cursor: "pointer", textAlign: "left", color: "#F5A623", fontSize: "12px", fontWeight: "700", display: "flex", alignItems: "center", gap: "8px" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                Rechercher "{inputVal}"
              </button>
            </div>
          )}
        </div>

        {/* Chips catégories scrollables */}
        <div className="no-scroll" style={{ overflowX: "auto", paddingBottom: "11px" }}>
          <div style={{ display: "flex", gap: "6px", padding: "0 16px", width: "max-content" }}>
            <button onClick={() => setFilterCat("")} className="tap" style={{ padding: "6px 13px", borderRadius: "20px", border: "none", background: !filterCat ? "linear-gradient(135deg,#F5A623,#C8940A)" : iBg, color: !filterCat ? "#080812" : t2, fontSize: "11px", fontWeight: !filterCat ? "800" : "600", cursor: "pointer", boxShadow: !filterCat ? "0 3px 10px rgba(245,166,35,0.3)" : "none" }}>
              Tout
            </button>
            {Object.entries(CAT_META).map(([key, val]) => (
              <button key={key} onClick={() => setFilterCat(filterCat === key ? "" : key)} className="tap" style={{ padding: "6px 12px", borderRadius: "20px", border: "none", background: filterCat === key ? "linear-gradient(135deg,#F5A623,#C8940A)" : iBg, color: filterCat === key ? "#080812" : t2, fontSize: "11px", fontWeight: filterCat === key ? "800" : "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", boxShadow: filterCat === key ? "0 3px 10px rgba(245,166,35,0.3)" : "none", whiteSpace: "nowrap" }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d={val.svgPath}/></svg>
                {val.short}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ══ HERO TikTok — disparaît au scroll ══ */}
      <div style={{ overflow: "hidden", maxHeight: heroVisible ? "180px" : "0", transition: "max-height 0.35s cubic-bezier(0.4,0,0.2,1)", opacity: heroVisible ? 1 : 0 }}>
        <div style={{ position: "relative", background: isDark ? "linear-gradient(160deg,#0F0E1A 0%,#1A1008 100%)" : "linear-gradient(160deg,#F5A623 0%,#C8740A 100%)", overflow: "hidden", padding: "20px 20px 18px" }}>
          {isDark && <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(245,166,35,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(245,166,35,0.04) 1px,transparent 1px)", backgroundSize: "40px 40px", pointerEvents: "none" }}/>}
          {!isDark && <><div style={{ position: "absolute", top: "-40px", right: "-40px", width: "160px", height: "160px", borderRadius: "50%", background: "rgba(255,255,255,0.08)", pointerEvents: "none" }}/><div style={{ position: "absolute", bottom: "-30px", left: "-30px", width: "120px", height: "120px", borderRadius: "50%", background: "rgba(0,0,0,0.06)", pointerEvents: "none" }}/></>}
          <div style={{ position: "relative" }}>
            {/* Stats — compris en 2 secondes */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
              {[
                { n: loading ? "…" : String(total), sub: "Institutions", path: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" },
                { n: "224",                          sub: "Guinée",        path: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" },
                { n: "1 clic",                       sub: "Votre RDV",     path: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" },
              ].map(s => (
                <div key={s.sub} style={{ flex: 1, background: isDark ? "rgba(245,166,35,0.08)" : "rgba(0,0,0,0.1)", borderRadius: "10px", padding: "9px 8px", textAlign: "center", border: "1px solid rgba(245,166,35,0.15)" }}>
                  <div style={{ color: isDark ? "#F5A623" : "#080812", fontSize: "13px", fontWeight: "900" }}>{s.n}</div>
                  <div style={{ color: isDark ? "rgba(245,166,35,0.5)" : "rgba(0,0,0,0.5)", fontSize: "8px", fontWeight: "700", letterSpacing: "0.3px" }}>{s.sub}</div>
                </div>
              ))}
            </div>
            <h1 style={{ color: isDark ? "#F0EEE8" : "#080812", fontSize: "16px", fontWeight: "900", margin: "0 0 3px", letterSpacing: "-0.3px", lineHeight: 1.2 }}>
              Le store officiel des services guinéens
            </h1>
            <p style={{ color: isDark ? "rgba(245,166,35,0.55)" : "rgba(0,0,0,0.55)", fontSize: "11px", margin: 0, fontWeight: "500" }}>
              Trouvez, comparez et réservez votre RDV en un clic.
            </p>
          </div>
        </div>
      </div>

      {/* ══ FILTRES AVANCÉS ══ */}
      {showFilters && (
        <div style={{ margin: "10px 16px", background: C.cardBg, border: `1px solid rgba(245,166,35,0.12)`, borderRadius: "16px", padding: "16px", animation: "slideDown 0.2s ease" }}>
          <div style={{ color: t2, fontSize: "9px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "12px" }}>Filtres avancés</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
            {[
              { label: "Ville", val: filterVille, onChange: (v: string) => setFilterVille(v), options: VILLES, placeholder: "Toutes les villes" },
            ].map(f => (
              <div key={f.label}>
                <div style={{ color: t2, fontSize: "9px", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "5px" }}>{f.label}</div>
                <select value={f.val} onChange={e => f.onChange(e.target.value)} style={{ width: "100%", padding: "9px 10px", background: iBg, border: `1px solid ${iBrd}`, borderRadius: "10px", fontSize: "12px", color: C.text, fontWeight: "600" }}>
                  <option value="">{f.placeholder}</option>
                  {f.options.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            ))}
            <div>
              <div style={{ color: t2, fontSize: "9px", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "5px" }}>Trier par</div>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as "note"|"avis"|"nom")} style={{ width: "100%", padding: "9px 10px", background: iBg, border: `1px solid ${iBrd}`, borderRadius: "10px", fontSize: "12px", color: C.text, fontWeight: "600" }}>
                <option value="note">Meilleure note</option>
                <option value="avis">Plus d'avis</option>
                <option value="nom">Alphabétique</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {[
              { label: "Institutions vérifiées uniquement", val: filterVerifie, set: () => setFilterVerifie(v => !v), path: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
              { label: "Avec créneaux disponibles",         val: filterDispos,   set: () => setFilterDispos(v => !v),   path: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" },
            ].map(f => (
              <button key={f.label} onClick={f.set} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: f.val ? "rgba(245,166,35,0.08)" : iBg, border: `1px solid ${f.val ? "rgba(245,166,35,0.3)" : iBrd}`, borderRadius: "10px", cursor: "pointer" }}>
                <div style={{ width: "18px", height: "18px", borderRadius: "5px", background: f.val ? "#F5A623" : "transparent", border: `2px solid ${f.val ? "#F5A623" : iBrd}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
                  {f.val && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={f.val ? "#F5A623" : t2} strokeWidth="2" strokeLinecap="round"><path d={f.path}/></svg>
                <span style={{ color: f.val ? C.text : t2, fontSize: "12px", fontWeight: f.val ? "700" : "500", flex: 1, textAlign: "left" }}>{f.label}</span>
              </button>
            ))}
          </div>
          {activeFilters > 0 && (
            <button onClick={() => { setFilterCat(""); setFilterVille(""); setFilterVerifie(false); setFilterDispos(false); setSearch(""); setInputVal(""); }} className="tap" style={{ width: "100%", marginTop: "10px", padding: "9px", background: "none", border: "1px dashed rgba(245,166,35,0.2)", borderRadius: "10px", color: t2, fontSize: "11px", fontWeight: "600", cursor: "pointer" }}>
              Réinitialiser ({activeFilters} filtre{activeFilters > 1 ? "s" : ""})
            </button>
          )}
        </div>
      )}

      {/* ══ CONTENU ══ */}
      <main style={{ padding: "12px 16px 0" }}>

        {/* Skeleton */}
        {loading && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            {[...Array(6)].map((_, i) => <SkeletonCard key={i} isDark={isDark}/>)}
          </div>
        )}

        {/* Carte */}
        {!loading && vue === "carte" && (
          <div style={{ height: "calc(100svh - 200px)", borderRadius: "16px", overflow: "hidden", border: `1px solid rgba(245,166,35,0.12)` }}>
            <CarteMap institutions={institutions.filter(i => i.latitude && i.longitude)}/>
          </div>
        )}

        {/* Empty */}
        {!loading && vue !== "carte" && institutions.length === 0 && (
          <div style={{ background: C.cardBg, border: `1px solid rgba(245,166,35,0.1)`, borderRadius: "20px", padding: "48px 20px", textAlign: "center", animation: "fadeUp 0.3s ease" }}>
            <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="1.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </div>
            <div style={{ color: C.text, fontSize: "15px", fontWeight: "800", marginBottom: "6px" }}>Aucune institution trouvée</div>
            <div style={{ color: t2, fontSize: "12px", lineHeight: 1.6, marginBottom: "16px" }}>Modifiez vos filtres ou élargissez la recherche.</div>
            <button onClick={() => { setFilterCat(""); setFilterVille(""); setFilterVerifie(false); setSearch(""); setInputVal(""); }} className="tap" style={{ padding: "10px 20px", background: "linear-gradient(135deg,#F5A623,#C8940A)", borderRadius: "12px", border: "none", color: "#080812", fontWeight: "800", fontSize: "13px", cursor: "pointer" }}>
              Voir tout
            </button>
          </div>
        )}

        {/* ── GRILLE 2 colonnes style Amazon ── */}
        {!loading && vue === "grille" && institutions.length > 0 && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", animation: "fadeUp 0.3s ease" }}>
              {visible.map(inst => <CardGrille key={inst.id} inst={inst} C={C as typeof T["dark"]}/>)}
            </div>
            {hasMore && (
              <button onClick={() => setPage(p => p + 1)} className="tap" style={{ width: "100%", marginTop: "12px", padding: "13px", background: iBg, border: "1px solid rgba(245,166,35,0.2)", borderRadius: "14px", color: "#F5A623", fontWeight: "700", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m7 10 5 5 5-5"/></svg>
                Charger la suite ({institutions.length - visible.length} restants)
              </button>
            )}
          </>
        )}

        {/* ── LISTE détaillée style LinkedIn ── */}
        {!loading && vue === "liste" && institutions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", animation: "fadeUp 0.3s ease" }}>
            {visible.map(inst => {
              const meta = CAT_META[inst.category] || CAT_META["Autre"];
              const hasD = inst.disponibilites && (Array.isArray(inst.disponibilites) ? (inst.disponibilites as unknown[]).length > 0 : true);
              return (
                <a key={inst.id} href={`/institution/${inst.id}`} style={{ textDecoration: "none", display: "flex", gap: "12px", background: C.cardBg, borderRadius: "16px", border: `1px solid ${C.borderCard}`, padding: "13px", position: "relative", overflow: "hidden" }} className="inst-card">
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "3px", background: "linear-gradient(180deg,#F5A623,rgba(245,166,35,0.2))" }}/>
                  <InstitutionLogo inst={inst} size={52}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "6px", marginBottom: "4px" }}>
                      <div style={{ color: C.text, fontSize: "13px", fontWeight: "800", lineHeight: 1.25, flex: 1 }}>{inst.name}</div>
                      {inst.badge_verifie && (
                        <div style={{ display: "flex", alignItems: "center", gap: "3px", padding: "2px 6px", background: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.25)", borderRadius: "20px", flexShrink: 0 }}>
                          <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                          <span style={{ color: "#F5A623", fontSize: "7px", fontWeight: "800" }}>VÉRIFIÉ</span>
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "4px" }}>
                      <span style={{ background: "rgba(245,166,35,0.1)", color: "#F5A623", fontSize: "8px", fontWeight: "800", padding: "2px 7px", borderRadius: "20px" }}>{meta.short}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="rgba(245,166,35,0.5)" strokeWidth="2.5" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        <span style={{ color: t2, fontSize: "10px" }}>{inst.ville || "Guinée"}{inst.quartier ? ` · ${inst.quartier}` : ""}</span>
                      </div>
                    </div>
                    <Stars note={inst.moyenne_avis || 0} count={inst.nb_avis || 0}/>
                    {inst.description && <div style={{ color: t2, fontSize: "11px", lineHeight: 1.5, marginTop: "4px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>{inst.description}</div>}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: hasD ? "#F5A623" : iBrd }}/>
                        <span style={{ color: hasD ? "#F5A623" : t2, fontSize: "9px", fontWeight: "700" }}>{hasD ? "Créneaux dispo" : "Sur demande"}</span>
                      </div>
                      <div style={{ flex: 1 }}/>
                      <div style={{ padding: "6px 12px", background: "linear-gradient(135deg,#F5A623,#C8940A)", borderRadius: "8px", display: "flex", alignItems: "center", gap: "4px", boxShadow: "0 3px 10px rgba(245,166,35,0.25)" }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        <span style={{ color: "#080812", fontSize: "10px", fontWeight: "900" }}>RDV</span>
                      </div>
                    </div>
                  </div>
                </a>
              );
            })}
            {hasMore && (
              <button onClick={() => setPage(p => p + 1)} className="tap" style={{ width: "100%", padding: "13px", background: iBg, border: "1px solid rgba(245,166,35,0.2)", borderRadius: "14px", color: "#F5A623", fontWeight: "700", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m7 10 5 5 5-5"/></svg>
                Charger la suite ({institutions.length - visible.length} restants)
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        {!loading && institutions.length > 0 && (
          <div style={{ textAlign: "center", padding: "24px 0 8px" }}>
            <div style={{ color: t2, fontSize: "11px", fontWeight: "600", marginBottom: "8px" }}>{total} institution{total > 1 ? "s" : ""} · Yelen224</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: "14px", height: "10px", background: "#CE1126", borderRadius: "2px 0 0 2px" }}/>
              <div style={{ width: "14px", height: "10px", background: "#FCD20F" }}/>
              <div style={{ width: "14px", height: "10px", background: "#009A44", borderRadius: "0 2px 2px 0" }}/>
              <span style={{ color: t2, fontSize: "10px", marginLeft: "8px", fontWeight: "600" }}>République de Guinée</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function RecherchePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100svh", backgroundColor: "#07071a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "36px", height: "36px", border: "3px solid rgba(245,166,35,0.15)", borderTopColor: "#F5A623", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    }>
      <RechercheInner/>
    </Suspense>
  );
}