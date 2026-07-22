"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useTheme } from "@/components/ThemeProvider";
import { YelenLogo } from "@/components/YelenLogo";
import { formatYelenId } from "@/lib/citoyenIdentite";
import { generateBrandedQR } from "@/lib/qrBrand";

const P = { pointerEvents: "none" as const };
const Ic = {
  Back:  () => <svg style={P} width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>,
  QR:    () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM17 17h3v3h-3z"/></svg>,
  X:     () => <svg style={P} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Share: () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.5" x2="15.4" y2="6.5"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/></svg>,
  Handshake: () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 3 3a1 1 0 1 0 3-3l-3.5-3.5"/><path d="m8.5 8.5 6 6a1 1 0 1 0 3-3l-5-5"/><path d="M3 12l4-4a2 2 0 0 1 3 0l1 1"/></svg>,
  Star:  () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  Award: () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6"/><path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12"/></svg>,
  Calendar: () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
};

const ECOSYSTEME = [
  { titre: "Authentification rapide chez les partenaires", desc: "Présentez votre Yelen ID pour vous identifier instantanément chez les établissements partenaires.", icon: Ic.Handshake },
  { titre: "Programme de fidélité", desc: "Cumulez des avantages à chaque rendez-vous honoré sur la plateforme.", icon: Ic.Star },
  { titre: "Badges & niveaux", desc: "Débloquez des statuts de membre selon votre activité sur Yelen.", icon: Ic.Award },
  { titre: "Événements exclusifs", desc: "Accédez en avant-première à des événements réservés aux membres Yelen.", icon: Ic.Calendar },
];

type Sexe = "homme" | "femme";

type Profil = {
  prenom: string | null;
  nom: string | null;
  phone: string | null;
  photo_url: string | null;
  created_at: string | null;
  ville: string | null;
  date_naissance: string | null;
  sexe: Sexe | null;
  profession: string | null;
  email: string | null;
};

export function CarteYelenClient() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg   = isDark ? "#0A0A0F" : "#F2F2F7";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1   = isDark ? "#FFFFFF" : "#000000";
  const t2   = isDark ? "#8E8E93" : "#6C6C70";
  const t3   = isDark ? "#636366" : "#AEAEB2";
  const brd  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const card2 = isDark ? "#2C2C2E" : "#EBEBF0";

  const [userId, setUserId] = useState<string | null>(null);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!id) { router.replace("/inscription"); return; }
    setUserId(id);
    void (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("users")
        .select("prenom,nom,phone,photo_url,created_at,ville,date_naissance,sexe,profession,email")
        .eq("id", id)
        .maybeSingle();
      if (error) showToast("Impossible de charger votre profil.", "error");
      else setProfil(data as Profil);
      setLoading(false);
    })();
  }, [router]);

  useEffect(() => {
    if (!qrOpen || !userId) return;
    setQrLoading(true);
    setQrDataUrl(null);
    void (async () => {
      try {
        const url = await generateBrandedQR(`YELEN-ID:${formatYelenId(userId)}`, 600);
        setQrDataUrl(url);
      } catch {
        showToast("Impossible de générer le QR Code.", "error");
      } finally {
        setQrLoading(false);
      }
    })();
  }, [qrOpen, userId]);

  async function handlePartager() {
    if (!userId) return;
    const text = `Mon Yelen ID : ${formatYelenId(userId)}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Mon Yelen ID", text }); } catch {}
    } else {
      try { await navigator.clipboard.writeText(text); showToast("Copié dans le presse-papiers."); } catch {}
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100svh", backgroundColor: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "40px", height: "40px", border: `3px solid ${isDark ? "rgba(245,166,35,0.15)" : "rgba(245,166,35,0.2)"}`, borderTopColor: "#F5A623", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  const nomComplet = `${profil?.prenom ?? ""} ${profil?.nom ?? ""}`.trim() || "Citoyen Yelen";
  const initiales = ((profil?.prenom?.[0] ?? "") + (profil?.nom?.[0] ?? "")).toUpperCase() || "C";
  const membreDepuis = profil?.created_at
    ? new Date(profil.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : "—";
  const genreLabel = profil?.sexe === "homme" ? "Homme" : profil?.sexe === "femme" ? "Femme" : "—";
  const dateNaissanceLabel = profil?.date_naissance
    ? new Date(profil.date_naissance).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : "—";
  const yelenId = userId ? formatYelenId(userId) : "YL-????-????";
  const headerBg   = isDark ? bg : "linear-gradient(160deg,#F5A623 0%,#E8960A 45%,#C8740A 100%)";
  const headerText = isDark ? t1 : "#080812";
  const headerSub  = isDark ? "rgba(255,255,255,0.55)" : "rgba(8,8,18,0.65)";
  const chipBg     = isDark ? card2 : "#F5A623";
  const chipIcon   = isDark ? headerText : "#fff";
  const chipBrd    = isDark ? brd : "transparent";
  const chipShadow = isDark ? "none" : "0 2px 8px rgba(245,166,35,0.35)";

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif", paddingBottom: "40px" }}>
      <style>{`.tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}.tap:active{opacity:0.65;transform:scale(0.97)}@keyframes slideUp{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}`}</style>

      {/* HEADER — même langage visuel que CompteHeader (chip retour à
          gauche, titre centré), bouton droit remplacé par une action QR
          (rond doré) au lieu du "?" générique. */}
      <header style={{ position: "sticky", top: 0, zIndex: 100, background: headerBg, borderBottom: isDark ? `1px solid ${brd}` : "none" }}>
        <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "12px" }}>
          <button onClick={() => router.back()} className="tap" style={{ justifySelf: "start", display: "flex", alignItems: "center", gap: "8px", background: "none", border: "none", padding: 0, cursor: "pointer", color: headerText, minWidth: 0 }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "9px", background: chipBg, border: `1px solid ${chipBrd}`, boxShadow: chipShadow, display: "flex", alignItems: "center", justifyContent: "center", color: chipIcon, flexShrink: 0 }}>
              {Ic.Back()}
            </div>
            <span style={{ color: headerSub, fontSize: "13px", fontWeight: "700", whiteSpace: "nowrap" }}>Retour</span>
          </button>
          <div style={{ color: headerText, fontSize: "16px", fontWeight: "800", minWidth: 0, maxWidth: "180px", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Yelen ID</div>
          <button onClick={() => setQrOpen(true)} className="tap" style={{ justifySelf: "end", width: "36px", height: "36px", borderRadius: "50%", background: "linear-gradient(135deg,#F5A623,#C8940A)", border: "none", boxShadow: "0 2px 8px rgba(245,166,35,0.35)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            {Ic.QR()}
          </button>
        </div>
      </header>

      <div style={{ padding: "16px" }}>
        {/* CARTE PREMIUM */}
        <div style={{ borderRadius: "22px", overflow: "hidden", background: "linear-gradient(135deg,#080812 0%,#1a1208 100%)", border: "1px solid rgba(245,166,35,0.2)", boxShadow: "0 8px 32px rgba(0,0,0,0.35)", position: "relative" }}>
          <div style={{ position: "absolute", top: "-40px", right: "-40px", width: "180px", height: "180px", borderRadius: "50%", background: "radial-gradient(circle,rgba(245,166,35,0.08) 0%,transparent 70%)", pointerEvents: "none" }}/>

          <div style={{ padding: "20px 20px 18px", position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "22px" }}>
              <div style={{ width: "30px", height: "30px", borderRadius: "9px", background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <YelenLogo size={17} color="#080812" strokeWidth={2.6}/>
              </div>
              <div style={{ fontSize: "10px", fontWeight: "800", color: "#F5A623", letterSpacing: "2.5px" }}>YELEN ID</div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "20px" }}>
              {profil?.photo_url ? (
                <img src={profil.photo_url} alt="" style={{ width: "56px", height: "56px", borderRadius: "16px", objectFit: "cover", border: "1px solid rgba(245,166,35,0.3)" }}/>
              ) : (
                <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: "900", color: "#080812", flexShrink: 0 }}>{initiales}</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#fff", fontSize: "17px", fontWeight: "800", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nomComplet}</div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "12.5px", marginTop: "2px" }}>{profil?.phone ?? "—"}</div>
              </div>
            </div>

            {/* CADRE D'IDENTITÉ — genre/date de naissance/profession/ville/
                email directement sur la carte (pas une section à part) :
                c'est une vraie carte, utilisable pour s'identifier même
                hors Yelen (accès restreint à qui elle est montrée — sujet
                hors de ce chantier). Lignes et cellules à la manière
                d'une carte d'identité officielle. */}
            <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: "10px", overflow: "hidden", marginBottom: "18px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                <div style={{ padding: "9px 12px", borderRight: "1px solid rgba(255,255,255,0.1)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>Sexe</div>
                  <div style={{ color: "rgba(255,255,255,0.85)", fontSize: "12.5px", fontWeight: "700", marginTop: "2px" }}>{genreLabel}</div>
                </div>
                <div style={{ padding: "9px 12px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>Né(e) le</div>
                  <div style={{ color: "rgba(255,255,255,0.85)", fontSize: "12.5px", fontWeight: "700", marginTop: "2px" }}>{dateNaissanceLabel}</div>
                </div>
                <div style={{ padding: "9px 12px", borderRight: "1px solid rgba(255,255,255,0.1)" }}>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>Profession</div>
                  <div style={{ color: "rgba(255,255,255,0.85)", fontSize: "12.5px", fontWeight: "700", marginTop: "2px" }}>{profil?.profession || "—"}</div>
                </div>
                <div style={{ padding: "9px 12px" }}>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>Ville</div>
                  <div style={{ color: "rgba(255,255,255,0.85)", fontSize: "12.5px", fontWeight: "700", marginTop: "2px" }}>{profil?.ville || "—"}</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                <div style={{ padding: "9px 12px", borderRight: "1px solid rgba(255,255,255,0.1)", minWidth: 0 }}>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>Email</div>
                  <div style={{ color: "rgba(255,255,255,0.85)", fontSize: "12.5px", fontWeight: "700", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profil?.email || "—"}</div>
                </div>
                <div style={{ padding: "9px 12px", minWidth: 0 }}>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>Identifiant Yelen</div>
                  <div style={{ color: "#F5A623", fontSize: "12.5px", fontWeight: "700", marginTop: "2px", fontFamily: "monospace", letterSpacing: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{yelenId}</div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "14px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>Membre depuis</div>
                <div style={{ color: "rgba(255,255,255,0.75)", fontSize: "13px", fontWeight: "700", marginTop: "2px" }}>{membreDepuis}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>Statut</div>
                <div style={{ color: "rgba(255,255,255,0.75)", fontSize: "13px", fontWeight: "700", marginTop: "2px" }}>Membre actif</div>
              </div>
            </div>
          </div>

          <div style={{ height: "4px", background: "linear-gradient(90deg,#CE1126 33.3%,#FCD20F 33.3% 66.6%,#009A44 66.6%)" }}/>
        </div>

        {/* PARTAGER */}
        <button onClick={handlePartager} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: card, border: `1px solid ${brd}`, borderRadius: "14px", padding: "13px", marginTop: "12px", color: t1, fontSize: "14px", fontWeight: "700", cursor: "pointer" }}>
          {Ic.Share()}
          Partager ma carte
        </button>

        {/* ÉCOSYSTÈME — vision long terme du brief, présentée honnêtement
            comme à venir (aucune de ces fonctionnalités n'est active). */}
        <div style={{ marginTop: "28px" }}>
          <div style={{ color: t3, fontSize: "12px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "10px", paddingLeft: "4px" }}>L&apos;écosystème Yelen arrive</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {ECOSYSTEME.map((item) => (
              <div key={item.titre} style={{ display: "flex", alignItems: "flex-start", gap: "12px", background: card, border: `1px solid ${brd}`, borderRadius: "16px", padding: "14px" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: "rgba(245,166,35,0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#F5A623", flexShrink: 0 }}>{item.icon()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                    <div style={{ color: t1, fontSize: "13.5px", fontWeight: "700" }}>{item.titre}</div>
                    <span style={{ flexShrink: 0, background: card2, color: t2, fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "20px" }}>Bientôt</span>
                  </div>
                  <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.5 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MODALE QR — plein écran, par-dessus l'écran (état local, pas de
          navigation), contenu de fond conservé une fois refermée. */}
      {qrOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, backgroundColor: bg, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 12px", backgroundColor: isDark ? "rgba(10,10,15,0.97)" : "rgba(248,248,252,0.97)", backdropFilter: "blur(20px)", borderBottom: `1px solid ${brd}`, flexShrink: 0 }}>
            <div style={{ color: t1, fontSize: "17px", fontWeight: "700" }}>Mon Yelen ID</div>
            <button onClick={() => setQrOpen(false)} className="tap" style={{ background: card2, border: "none", borderRadius: "50%", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}>{Ic.X()}</button>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "32px 20px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            {qrLoading || !qrDataUrl ? (
              <div style={{ width: "60px", height: "60px", borderRadius: "50%", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", margin: "60px auto", animation: "spin 1s linear infinite" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              </div>
            ) : (
              <>
                <div style={{ display: "inline-block", padding: "16px", backgroundColor: "#fff", borderRadius: "16px", border: "3px solid #F5A623", marginBottom: "20px", boxShadow: "0 4px 20px rgba(245,166,35,0.2)" }}>
                  <img src={qrDataUrl} alt="QR Code Yelen ID" width="240" height="240" style={{ display: "block", borderRadius: "8px" }}/>
                </div>
                <div style={{ fontFamily: "monospace", fontSize: "18px", fontWeight: "800", color: "#F5A623", letterSpacing: "1px", marginBottom: "14px" }}>{yelenId}</div>
                <div style={{ color: t2, fontSize: "13px", lineHeight: 1.6, textAlign: "center", maxWidth: "320px" }}>Ce code identifie votre compte Yelen. Ne le partagez qu&apos;aux personnes ou établissements de confiance.</div>
              </>
            )}
          </div>
        </div>
      )}

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
