"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader, CompteLoadingScreen } from "@/components/CompteEcranVide";
import { PullToRefresh } from "@/components/PullToRefresh";
import { EmptyState } from "@/components/EmptyState";
import { SECTEUR_LABELS } from "@/lib/institutionTaxonomy";

const P = { pointerEvents: "none" as const };
const Ic = {
  Search: () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Star:   (filled: boolean, color = "#F5A623") => <svg width="13" height="13" viewBox="0 0 20 20" fill={filled ? color : "none"} stroke={color} strokeWidth="1"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 0 .95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 0-.364 1.118l1.07 3.292c.3.922-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 0 0-1.176 0l-2.8 2.034c-.783.57-1.838-.196-1.539-1.118l1.07-3.292a1 1 0 0 0-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81H7.03a1 1 0 0 0 .95-.69l1.07-3.292Z"/></svg>,
  Shield: () => <svg style={P} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Announce: () => <svg style={P} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>,
  Pin:    () => <svg style={P} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  Route:  () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M9 19h8a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H7a2 2 0 0 1-2-2V5"/></svg>,
  Share:  () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>,
  Trash:  () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/></svg>,
  Heart:  () => <svg style={P} width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  Cal:    () => <svg style={P} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Clock:  () => <svg style={P} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
};

type Favori = {
  institution_id: string;
  name: string;
  secteur: string | null;
  ville: string | null;
  quartier: string | null;
  logo: string | null;
  badge_verifie: boolean;
  moyenne_avis: number;
  nb_avis: number;
  latitude: number | null;
  longitude: number | null;
  ouvert: boolean;
  annonce_active: boolean;
  services_actifs: number;
  derniere_visite: string | null;
  favori_depuis: string;
  prochain_creneau: { date_rdv: string; heure_rdv: string } | null;
  temps_attente_minutes: number | null;
};

function formatProchainCreneau(c: { date_rdv: string; heure_rdv: string } | null): string | null {
  if (!c) return null;
  const d = new Date(`${c.date_rdv}T${c.heure_rdv}:00`);
  const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);
  const jours = Math.round((d.getTime() - aujourdHui.getTime()) / (1000 * 60 * 60 * 24));
  const jourLabel = jours === 0 ? "aujourd'hui" : jours === 1 ? "demain" : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
  return `${jourLabel} à ${c.heure_rdv}`;
}

function formatAttente(minutes: number | null): string | null {
  if (minutes === null) return null;
  if (minutes < 60) return `~${minutes} min d'attente en moyenne`;
  return `~${(minutes / 60).toFixed(1)} h d'attente en moyenne`;
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatRelatif(iso: string | null): string {
  if (!iso) return "Jamais visité";
  const jours = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (jours < 1) return "Visité aujourd'hui";
  if (jours === 1) return "Visité hier";
  if (jours < 7) return `Visité il y a ${jours} jours`;
  if (jours < 30) return `Visité il y a ${Math.floor(jours / 7)} semaine${Math.floor(jours / 7) > 1 ? "s" : ""}`;
  if (jours < 365) return `Visité il y a ${Math.floor(jours / 30)} mois`;
  return `Visité il y a ${Math.floor(jours / 365)} an${Math.floor(jours / 365) > 1 ? "s" : ""}`;
}

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join("");
}

export function FavorisClient() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg   = isDark ? "#0A0A0F" : "#F2F2F7";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1   = isDark ? "#FFFFFF" : "#000000";
  const t2   = isDark ? "#8E8E93" : "#6C6C70";
  const t3   = isDark ? "#636366" : "#AEAEB2";
  const brd  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  const [favoris, setFavoris] = useState<Favori[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [secteurFiltre, setSecteurFiltre] = useState<string | null>(null);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const charger = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { showToast("Session expirée, reconnectez-vous.", "error"); return; }
    const res = await fetch("/api/citoyen/favoris", { headers: { Authorization: `Bearer ${session.access_token}` } });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) { showToast(json?.error ?? "Impossible de charger vos favoris.", "error"); return; }
    setFavoris(json.favoris);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!id) { router.replace("/inscription"); return; }
    void (async () => { setLoading(true); await charger(); setLoading(false); })();
  }, [router, charger]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { timeout: 5000 }
    );
  }, []);

  async function handleRetirer(institutionId: string) {
    if (!window.confirm("Retirer cet établissement de vos favoris ?")) return;
    setBusy(institutionId);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { showToast("Session expirée, reconnectez-vous.", "error"); setBusy(null); return; }
    const { error } = await supabase.from("citoyen_favoris").delete().eq("citoyen_id", session.user.id).eq("institution_id", institutionId);
    setBusy(null);
    if (error) { showToast("Impossible de retirer ce favori.", "error"); return; }
    setFavoris((prev) => prev?.filter((f) => f.institution_id !== institutionId) ?? null);
  }

  async function handlePartager(f: Favori) {
    const url = `${window.location.origin}/institution/${f.institution_id}`;
    if (navigator.share) {
      try { await navigator.share({ title: f.name, url }); } catch {}
    } else {
      try { await navigator.clipboard.writeText(url); showToast("Lien copié."); } catch {}
    }
  }

  const secteursPresents = useMemo(() => {
    const set = new Set((favoris ?? []).map((f) => f.secteur).filter((s): s is string => !!s));
    return Array.from(set);
  }, [favoris]);

  const favorisFiltres = useMemo(() => {
    if (!favoris) return [];
    const q = recherche.trim().toLowerCase();
    return favoris.filter((f) => {
      if (secteurFiltre && f.secteur !== secteurFiltre) return false;
      if (!q) return true;
      return f.name.toLowerCase().includes(q) || (f.ville ?? "").toLowerCase().includes(q) || (f.quartier ?? "").toLowerCase().includes(q);
    });
  }, [favoris, recherche, secteurFiltre]);

  const kpi = useMemo(() => {
    const list = favoris ?? [];
    const trenteJours = nowTick - 30 * 24 * 60 * 60 * 1000;
    return {
      total: list.length,
      visites: list.filter((f) => f.derniere_visite).length,
      nouveaux: list.filter((f) => new Date(f.favori_depuis).getTime() >= trenteJours).length,
      ouverts: list.filter((f) => f.ouvert).length,
    };
  }, [favoris, nowTick]);

  const btnGhost: React.CSSProperties = {
    background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", color: t1, fontWeight: 700, fontSize: "12.5px",
    padding: "8px 12px", borderRadius: "10px", border: `1px solid ${brd}`, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px",
  };

  if (loading) {
    return <CompteLoadingScreen titre="Établissements favoris"/>;
  }

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`.tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}.tap:active{opacity:0.65;transform:scale(0.97)}@keyframes slideUp{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}`}</style>
      <CompteHeader titre="Établissements favoris"/>
      <PullToRefresh onRefresh={charger} isDark={isDark}>
      <main style={{ padding: "16px 16px 40px" }}>
        <div style={{ padding: "4px 4px 20px" }}>
          <p style={{ color: t2, fontSize: "13.5px", margin: 0, lineHeight: 1.5 }}>Retrouvez rapidement vos établissements préférés.</p>
        </div>

        {/* Résumé */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: "20px" }}>
          {[
            { label: "Favoris", valeur: kpi.total },
            { label: "Visités", valeur: kpi.visites },
            { label: "Nouveaux", valeur: kpi.nouveaux },
            { label: "Ouverts", valeur: kpi.ouverts },
          ].map((k) => (
            <div key={k.label} style={{ backgroundColor: card, borderRadius: "14px", padding: "12px 8px", textAlign: "center" }}>
              <div style={{ color: t1, fontSize: "18px", fontWeight: 900 }}>{k.valeur}</div>
              <div style={{ color: t2, fontSize: "10.5px", fontWeight: 700, marginTop: "2px" }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Recherche */}
        <div style={{ position: "relative", marginBottom: "12px" }}>
          <div style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: t3 }}><Ic.Search/></div>
          <input
            value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un établissement…"
            style={{ width: "100%", backgroundColor: card, border: `1px solid ${brd}`, borderRadius: "14px", padding: "12px 14px 12px 40px", color: t1, fontSize: "14px" }}
          />
        </div>

        {/* Filtres secteur */}
        {secteursPresents.length > 1 && (
          <div style={{ display: "flex", gap: "8px", overflowX: "auto", marginBottom: "20px", paddingBottom: "2px" }}>
            <button className="tap" onClick={() => setSecteurFiltre(null)} style={{ ...btnGhost, flexShrink: 0, backgroundColor: !secteurFiltre ? "#F5A623" : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"), borderColor: !secteurFiltre ? "#F5A623" : brd, color: !secteurFiltre ? "#080812" : t1 }}>Tous</button>
            {secteursPresents.map((s) => (
              <button key={s} className="tap" onClick={() => setSecteurFiltre(s)} style={{ ...btnGhost, flexShrink: 0, backgroundColor: secteurFiltre === s ? "#F5A623" : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"), borderColor: secteurFiltre === s ? "#F5A623" : brd, color: secteurFiltre === s ? "#080812" : t1 }}>
                {SECTEUR_LABELS[s] ?? s}
              </button>
            ))}
          </div>
        )}

        {/* Liste */}
        {favorisFiltres.length === 0 && (favoris?.length ?? 0) === 0 && (
          <div style={{ textAlign: "center", padding: "28px 20px 20px" }}>
            <EmptyState variant="favoris" title="Aucun favori" message="Ajoutez vos établissements préférés afin de les retrouver rapidement et recevoir leurs annonces." color="#F5A623" titleColor={t1} textColor={t2}/>
            <Link href="/recherche" className="tap" style={{ display: "inline-block", background: "#F5A623", color: "#080812", fontWeight: 800, fontSize: "14px", padding: "13px 22px", borderRadius: "14px", textDecoration: "none" }}>Découvrir des établissements</Link>
          </div>
        )}

        {favorisFiltres.length === 0 && (favoris?.length ?? 0) > 0 && (
          <EmptyState variant="recherche" title="Aucun résultat" message="Essayez une autre recherche ou modifiez vos filtres." color="#F5A623" titleColor={t1} textColor={t2}/>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {favorisFiltres.map((f) => {
            const dist = position && f.latitude && f.longitude ? distanceKm(position.lat, position.lng, f.latitude, f.longitude) : null;
            return (
              <div key={f.institution_id} style={{ backgroundColor: card, borderRadius: "18px", padding: "16px" }}>
                <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
                  <div style={{ width: "48px", height: "48px", position: "relative", borderRadius: "14px", background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                    {f.logo ? <Image src={f.logo} alt="" fill sizes="48px" style={{ objectFit: "cover" }}/> : <span style={{ color: "#080812", fontWeight: 800, fontSize: "15px" }}>{initials(f.name)}</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                      <div style={{ color: t1, fontSize: "15px", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                      {f.badge_verifie && <span style={{ flexShrink: 0 }}><Ic.Shield/></span>}
                    </div>
                    <div style={{ color: "#F5A623", fontSize: "11.5px", fontWeight: 700, marginBottom: "3px" }}>{f.secteur ? (SECTEUR_LABELS[f.secteur] ?? f.secteur) : "Non renseigné"}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", color: t2, fontSize: "11.5px" }}>
                      <Ic.Pin/>{[f.quartier, f.ville].filter(Boolean).join(", ") || "—"}{dist !== null ? ` · ${dist.toFixed(1)} km` : ""}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                  {Ic.Star(true)}
                  <span style={{ color: t1, fontSize: "12.5px", fontWeight: 700 }}>{f.moyenne_avis.toFixed(1)}</span>
                  <span style={{ color: t3, fontSize: "11.5px" }}>({f.nb_avis} avis)</span>
                  <span style={{ color: t3 }}>·</span>
                  <span style={{ color: f.ouvert ? "#22c55e" : "#ef4444", fontSize: "11.5px", fontWeight: 800 }}>{f.ouvert ? "Ouvert" : "Fermé"}</span>
                  {f.services_actifs > 0 && (<><span style={{ color: t3 }}>·</span><span style={{ color: t2, fontSize: "11.5px" }}>{f.services_actifs} service{f.services_actifs > 1 ? "s" : ""}</span></>)}
                </div>

                {(f.prochain_creneau || f.temps_attente_minutes !== null) && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "10px" }}>
                    {f.prochain_creneau && (
                      <div style={{ display: "flex", alignItems: "center", gap: "5px", color: "#22c55e", fontSize: "11.5px", fontWeight: 700 }}>
                        <Ic.Cal/> Prochain créneau : {formatProchainCreneau(f.prochain_creneau)}
                      </div>
                    )}
                    {f.temps_attente_minutes !== null && (
                      <div style={{ display: "flex", alignItems: "center", gap: "5px", color: t2, fontSize: "11px" }}>
                        <Ic.Clock/> {formatAttente(f.temps_attente_minutes)}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <span style={{ color: t3, fontSize: "11.5px" }}>{formatRelatif(f.derniere_visite)}</span>
                  {f.annonce_active && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#F5A623", color: "#080812", fontSize: "10.5px", fontWeight: 800, padding: "3px 8px", borderRadius: "20px" }}>
                      <Ic.Announce/> Nouvelle annonce
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <Link href={`/institution/${f.institution_id}`} className="tap" style={{ flex: 1, textAlign: "center", background: "#F5A623", color: "#080812", fontWeight: 800, fontSize: "13px", padding: "10px", borderRadius: "12px", textDecoration: "none" }}>Voir le profil</Link>
                  {f.latitude && f.longitude && (
                    <a href={`https://www.google.com/maps/search/?api=1&query=${f.latitude},${f.longitude}`} target="_blank" rel="noreferrer" className="tap" style={{ ...btnGhost, padding: "10px" }}><Ic.Route/></a>
                  )}
                  <button className="tap" style={{ ...btnGhost, padding: "10px" }} onClick={() => handlePartager(f)}><Ic.Share/></button>
                  <button disabled={busy === f.institution_id} className="tap" style={{ ...btnGhost, padding: "10px", color: "#ef4444", opacity: busy === f.institution_id ? 0.5 : 1 }} onClick={() => handleRetirer(f.institution_id)}><Ic.Trash/></button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
      </PullToRefresh>

      {toast && (
        <div style={{
          position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
          padding: "12px 24px", borderRadius: "12px", fontSize: "14px", fontWeight: 500,
          zIndex: 9500, animation: "slideUp 0.25s ease", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", whiteSpace: "nowrap",
          backgroundColor: toast.type === "success" ? (isDark ? "#0F2A1A" : "#f0faf5") : (isDark ? "#2A0F0F" : "#fef2f2"),
          border: `1px solid ${toast.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: toast.type === "success" ? "#22c55e" : "#ef4444",
        }}>
          {toast.type === "success" ? "✓ " : "⚠ "}{toast.msg}
        </div>
      )}
    </div>
  );
}
