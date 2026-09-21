"use client";

// Vérification d'identité citoyen — flux complet recto + verso + selfie
// (28/08/2026, retour Bryan — remplace le flux recto seul livré le même
// jour). Toujours un vrai pipeline : upload passe en "en_attente", jamais
// d'auto-vérification (voir app/api/citoyen/verification-identite/upload/route.ts).
// L'écran de revue admin qui décide vérifié/refusé vit dans
// app/admin/identite-citoyens/page.tsx.
// Boutons en doré plat #F5A623 (jamais de dégradé) — même traitement que
// CompteHeader et le reste des CTA "aplatis" du produit (retour Bryan
// 28/08/2026, la version dégradée du même jour était déjà obsolète).
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader, CompteLoadingScreen } from "@/components/CompteEcranVide";
import { PullToRefresh } from "@/components/PullToRefresh";
import { YelenLoader } from "@/components/YelenLoader";

const P = { pointerEvents: "none" as const };
const Ic = {
  Shield: ({ size = 40 }: { size?: number }) => <svg style={P} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Check:  ({ size = 20 }: { size?: number }) => <svg style={P} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  CheckSm:() => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Alert:  ({ size = 14 }: { size?: number }) => <svg style={P} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>,
  Lock:   ({ size = 14 }: { size?: number }) => <svg style={P} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  Clock:  ({ size = 40 }: { size?: number }) => <svg style={P} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>,
  Camera: () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  Folder: () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  File:   ({ size = 28 }: { size?: number }) => <svg style={P} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  X:      () => <svg style={P} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  User:   ({ size = 36 }: { size?: number }) => <svg style={P} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-5 6-7 8-7s6.5 2 8 7"/></svg>,
  Bell:   () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  // Mockups neutres (aucune donnée réelle) — illustration maison plutôt
  // qu'une photo Pexels d'une pièce d'identité (risque d'authenticité/droits
  // sur ce type d'image) — cohérent avec le reste de l'app, aucune icône
  // importée nulle part.
  IdMock: ({ verso = false }: { verso?: boolean }) => (
    <svg width="100%" height="100%" viewBox="0 0 140 88" fill="none">
      <rect x="1.5" y="1.5" width="137" height="85" rx="9" fill="currentColor" opacity="0.05" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5"/>
      {!verso ? (
        <>
          <circle cx="29" cy="30" r="9" fill="currentColor" opacity="0.4"/>
          <path d="M15 55c2-9 8-13 14-13s12 4 14 13" fill="currentColor" opacity="0.4"/>
          <rect x="54" y="18" width="68" height="6" rx="3" fill="currentColor" opacity="0.32"/>
          <rect x="54" y="31" width="52" height="5" rx="2.5" fill="currentColor" opacity="0.22"/>
          <rect x="54" y="41" width="58" height="5" rx="2.5" fill="currentColor" opacity="0.22"/>
          <rect x="54" y="51" width="38" height="5" rx="2.5" fill="currentColor" opacity="0.22"/>
          <rect x="106" y="66" width="22" height="14" rx="2" fill="currentColor" opacity="0.16"/>
        </>
      ) : (
        <>
          <rect x="12" y="14" width="116" height="5" rx="2.5" fill="currentColor" opacity="0.3"/>
          <rect x="12" y="24" width="98" height="5" rx="2.5" fill="currentColor" opacity="0.22"/>
          <rect x="12" y="34" width="108" height="5" rx="2.5" fill="currentColor" opacity="0.22"/>
          <rect x="12" y="44" width="78" height="5" rx="2.5" fill="currentColor" opacity="0.22"/>
          <rect x="12" y="61" width="116" height="4.5" rx="2" fill="currentColor" opacity="0.32"/>
          <rect x="12" y="70" width="116" height="4.5" rx="2" fill="currentColor" opacity="0.32"/>
        </>
      )}
    </svg>
  ),
  FaceMock: () => (
    <svg width="100%" height="100%" viewBox="0 0 140 88" fill="none">
      <rect x="1.5" y="1.5" width="137" height="85" rx="9" fill="currentColor" opacity="0.05" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5"/>
      <circle cx="70" cy="34" r="16" fill="currentColor" opacity="0.35"/>
      <path d="M40 76c4-16 15-24 30-24s26 8 30 24" fill="currentColor" opacity="0.35"/>
      <path d="M14 14h10M14 14v10M126 14h-10M126 14v10M14 74h10M14 74v-10M126 74h-10M126 74v-10" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
};

const GOLD = "#F5A623";
const GREEN = "#22c55e";
const RED = "#ef4444";

type Statut = "jamais_soumis" | "en_attente" | "refusee" | "verifiee";
type ErreurBloc = { titre: string; message: string } | null;
type Slot = "recto" | "verso" | "selfie";

const SLOT_ORDER: Slot[] = ["recto", "verso", "selfie"];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
function formatDateHeure(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${heure}`;
}
function formatTaille(o: number): string {
  return o < 1024 * 1024 ? `${Math.round(o / 1024)} Ko` : `${(o / (1024 * 1024)).toFixed(1)} Mo`;
}

const MAX_TAILLE = 10 * 1024 * 1024;

type SlotMeta = {
  n: string; label: string; acceptedMimes: string[]; captureAttr: "environment" | "user";
  intituleZone: string; sousZone: string; guideTitre: string; dos: string[]; donts: string[];
  mock: (T: Tokens) => React.ReactNode;
};

const SLOT_META: Record<Slot, SlotMeta> = {
  recto: {
    n: "1/3", label: "Recto de la CIN",
    acceptedMimes: ["application/pdf", "image/jpeg", "image/png"],
    captureAttr: "environment",
    intituleZone: "Ajoutez le recto de votre CIN",
    sousZone: "Photo nette ou fichier PDF, JPG ou PNG",
    guideTitre: "Cadrez le recto de votre CIN",
    dos: ["Document entièrement visible, coins inclus", "Photo nette, sans flou", "Bien éclairé, sans reflet ni flash direct"],
    donts: ["Coin ou bord coupé", "Reflet, flash direct ou ombre"],
    mock: (T) => <ExempleCarte T={T} verso={false} label="RECTO" image="/illustrations/verification-recto-cin.png"/>,
  },
  verso: {
    n: "2/3", label: "Verso de la CIN",
    acceptedMimes: ["application/pdf", "image/jpeg", "image/png"],
    captureAttr: "environment",
    intituleZone: "Ajoutez le verso de votre CIN",
    sousZone: "Photo nette ou fichier PDF, JPG ou PNG",
    guideTitre: "Cadrez le verso de votre CIN",
    dos: ["Document entièrement visible, coins inclus", "Photo nette, sans flou", "Bien éclairé, sans reflet ni flash direct"],
    donts: ["Coin ou bord coupé", "Reflet, flash direct ou ombre"],
    mock: (T) => <ExempleCarte T={T} verso label="VERSO" image="/illustrations/verification-verso-cin.png"/>,
  },
  selfie: {
    n: "3/3", label: "Photo de vous",
    acceptedMimes: ["image/jpeg", "image/png", "image/webp"],
    captureAttr: "user",
    intituleZone: "Ajoutez une photo de vous",
    sousZone: "Visage bien visible, face à la caméra",
    guideTitre: "Prenez une photo de vous",
    dos: ["Visage bien visible, sans lunettes de soleil ni couvre-chef", "Regardez directement l'appareil", "Fond neutre, bonne luminosité"],
    donts: ["Photo de groupe", "Visage masqué ou à contre-jour"],
    mock: (T) => <ExempleFace T={T} image="/illustrations/verification-selfie-id.png"/>,
  },
};

export function VerificationIdentiteClient() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg   = isDark ? "#0A0A0F" : "#F2F2F7";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  const card2= isDark ? "#242426" : "#F7F7FA";
  const t1   = isDark ? "#FFFFFF" : "#000000";
  const t2   = isDark ? "#8E8E93" : "#6C6C70";
  const t3   = isDark ? "#636366" : "#AEAEB2";
  const brd  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  const [loading, setLoading] = useState(true);
  const [statut, setStatut] = useState<Statut>("jamais_soumis");
  const [motifRefus, setMotifRefus] = useState<string | null>(null);
  const [soumisLe, setSoumisLe] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const charger = useCallback(async (id: string) => {
    const { data } = await supabase.from("users").select("identite_verifiee,cin_soumis_le,cin_statut,cin_motif_refus").eq("id", id).maybeSingle();
    if (data) {
      const s: Statut = data.identite_verifiee ? "verifiee" : (data.cin_statut === "en_attente" || data.cin_statut === "refusee" ? data.cin_statut : "jamais_soumis");
      setStatut(s);
      setSoumisLe(data.cin_soumis_le ?? null);
      setMotifRefus(data.cin_motif_refus ?? null);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!id) { router.replace("/inscription"); return; }
    void (async () => { setLoading(true); await charger(id); setLoading(false); })();
  }, [router, charger]);

  const rafraichir = useCallback(async () => {
    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (id) await charger(id);
  }, [charger]);

  async function refaireApresEnvoi() {
    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (id) await charger(id);
    setRetrying(false);
  }

  if (loading) {
    return <CompteLoadingScreen titre="Vérification d'identité"/>;
  }

  const T = { bg, card, card2, t1, t2, t3, brd, isDark };

  let contenu: React.ReactNode;
  if (!retrying && statut === "verifiee") contenu = <EtatVerifie T={T} soumisLe={soumisLe}/>;
  else if (!retrying && statut === "en_attente") contenu = <EtatEnAttente T={T} soumisLe={soumisLe}/>;
  else if (!retrying && statut === "refusee") contenu = <EtatRefusee T={T} motif={motifRefus} onReessayer={() => setRetrying(true)}/>;
  else contenu = <FlowEnvoi T={T} showToast={showToast} onEnvoye={refaireApresEnvoi}/>;

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`.tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}.tap:active{opacity:0.65;transform:scale(0.97)}@keyframes slideUp{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}@keyframes sheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}@keyframes sheetFade{from{opacity:0}to{opacity:1}}@keyframes pulseDot{0%{box-shadow:0 0 0 0 rgba(245,166,35,0.45)}70%{box-shadow:0 0 0 8px rgba(245,166,35,0)}100%{box-shadow:0 0 0 0 rgba(245,166,35,0)}}.pulse-dot{animation:pulseDot 1.8s ease-out infinite}@media (prefers-reduced-motion: reduce){.pulse-dot{animation:none !important}}`}</style>
      <CompteHeader titre="Vérification d'identité"/>
      <PullToRefresh onRefresh={rafraichir} isDark={isDark}>
      <main style={{ padding: "16px 16px 48px" }}>
        {contenu}
      </main>
      </PullToRefresh>

      {toast && (
        <div style={{
          position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
          padding: "12px 24px", borderRadius: "12px", fontSize: "14px", fontWeight: 500,
          zIndex: 9500, animation: "slideUp 0.25s ease", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", whiteSpace: "nowrap",
          backgroundColor: toast.type === "success" ? (isDark ? "#0F2A1A" : "#f0faf5") : (isDark ? "#2A0F0F" : "#fef2f2"),
          border: `1px solid ${toast.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: toast.type === "success" ? GREEN : RED,
        }}>
          {toast.type === "success" ? "✓ " : "⚠ "}{toast.msg}
        </div>
      )}
    </div>
  );
}

type Tokens = { bg: string; card: string; card2: string; t1: string; t2: string; t3: string; brd: string; isDark: boolean };

// ── Section label, façon app/compte/confidentialite ──
function SectionTitre({ T, children }: { T: Tokens; children: React.ReactNode }) {
  return <div style={{ color: T.t1, fontSize: "15.5px", fontWeight: 800, marginBottom: "10px" }}>{children}</div>;
}

// ══════════════════════════════════════════════════════════════════
// État : jamais soumis / en train de renvoyer après refus — parcours
// complet en 3 étapes (recto → verso → selfie) puis confirmation.
// ══════════════════════════════════════════════════════════════════
function FlowEnvoi({ T, showToast, onEnvoye }: { T: Tokens; showToast: (m: string, t?: "success" | "error") => void; onEnvoye: () => void }) {
  const [slotIndex, setSlotIndex] = useState(0); // 0..2 = étape active, 3 = confirmation
  const [files, setFiles] = useState<Record<Slot, File | null>>({ recto: null, verso: null, selfie: null });
  const [previews, setPreviews] = useState<Record<Slot, string | null>>({ recto: null, verso: null, selfie: null });
  const [phase, setPhase] = useState<"choix" | "apercu">("choix");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<ErreurBloc>(null);
  const [dragOver, setDragOver] = useState(false);
  const [sheetMode, setSheetMode] = useState<"photo" | "fichier" | null>(null);
  const inputPhotoRef = useRef<HTMLInputElement>(null);
  const inputFichierRef = useRef<HTMLInputElement>(null);

  const currentSlot: Slot | null = slotIndex < 3 ? SLOT_ORDER[slotIndex] : null;
  const meta = currentSlot ? SLOT_META[currentSlot] : null;

  // Nettoyage des blobs locaux au démontage — chaque remplacement révoque
  // déjà l'ancien au moment du changement (voir selectionner/remplacer).
  useEffect(() => {
    return () => { Object.values(previews).forEach((u) => { if (u) URL.revokeObjectURL(u); }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function evaluerFichier(slot: Slot, f: File): ErreurBloc | null {
    if (f.size > MAX_TAILLE) {
      return { titre: "Document trop volumineux", message: "Ce fichier dépasse la taille maximale de 10 Mo. Choisissez une version plus légère ou reprenez la photo avec une résolution plus basse." };
    }
    if (!SLOT_META[slot].acceptedMimes.includes(f.type)) {
      return { titre: "Format non accepté", message: slot === "selfie" ? "Seuls les fichiers JPG ou PNG sont acceptés pour cette photo." : "Seuls les fichiers PDF, JPG ou PNG sont acceptés pour la pièce d'identité." };
    }
    return null;
  }

  function selectionner(f: File | null) {
    if (!f || !currentSlot) return;
    const pb = evaluerFichier(currentSlot, f);
    if (pb) { setErreur(pb); return; }
    setErreur(null);
    setFiles((prev) => ({ ...prev, [currentSlot]: f }));
    setPreviews((prev) => {
      if (prev[currentSlot]) URL.revokeObjectURL(prev[currentSlot]!);
      return { ...prev, [currentSlot]: f.type.startsWith("image/") ? URL.createObjectURL(f) : null };
    });
    setPhase("apercu");
  }

  function remplacer() {
    if (!currentSlot) return;
    setFiles((prev) => ({ ...prev, [currentSlot]: null }));
    setPreviews((prev) => {
      if (prev[currentSlot]) URL.revokeObjectURL(prev[currentSlot]!);
      return { ...prev, [currentSlot]: null };
    });
    setErreur(null);
    setPhase("choix");
  }

  function continuerVersSuivant() {
    setErreur(null);
    if (slotIndex < 2) { setSlotIndex((i) => i + 1); setPhase("choix"); }
    else setSlotIndex(3);
  }

  function modifierEtape(i: number) {
    setErreur(null);
    setSlotIndex(i);
    setPhase("apercu");
  }

  async function envoyer() {
    if (!files.recto || !files.verso || !files.selfie) return;
    setBusy(true);
    setErreur(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      showToast("Session expirée, reconnectez-vous.", "error");
      setBusy(false);
      return;
    }
    try {
      const fd = new FormData();
      fd.append("accessToken", session.access_token);
      fd.append("recto", files.recto);
      fd.append("verso", files.verso);
      fd.append("selfie", files.selfie);
      const res = await fetch("/api/citoyen/verification-identite/upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        if (json?.code === "INVALID_FORMAT") {
          const trop = /volumineux/i.test(json?.error ?? "");
          setErreur(trop
            ? { titre: "Document trop volumineux", message: "Ce fichier dépasse la taille maximale de 10 Mo." }
            : { titre: "Format non accepté", message: "Un des fichiers envoyés n'est pas valide. Vérifiez le format et réessayez." });
        } else {
          setErreur({ titre: "Vérification impossible", message: "Une erreur est survenue pendant l'envoi. Vérifiez votre connexion et réessayez." });
        }
        const champErrone = json?.champ as Slot | undefined;
        if (champErrone && SLOT_ORDER.includes(champErrone)) { setSlotIndex(SLOT_ORDER.indexOf(champErrone)); setPhase("apercu"); }
        setBusy(false);
        return;
      }
      setBusy(false);
      showToast("Documents envoyés pour vérification.");
      onEnvoye();
    } catch {
      setErreur({ titre: "Vérification impossible", message: "Connexion interrompue pendant l'envoi. Vérifiez votre réseau et réessayez." });
      setBusy(false);
    }
  }

  return (
    <>
      {/* ── Hero ── */}
      <div style={{ textAlign: "center", padding: "8px 8px 24px" }}>
        <Image src="/illustrations/verification-identite.png" alt="" width={1312} height={1199} style={{ width: "320px", maxWidth: "100%", height: "auto", margin: "0 auto 14px", display: "block" }}/>
        <div style={{ color: T.t1, fontSize: "19px", fontWeight: 900, letterSpacing: "-0.3px", marginBottom: "8px" }}>Vérifiez votre identité</div>
        <p style={{ color: T.t2, fontSize: "13.5px", lineHeight: 1.55, margin: "0 auto 14px", maxWidth: "380px" }}>
          Confirmez votre identité pour sécuriser votre compte Yelen et obtenir le badge « Vérifié » sur votre Yelen ID.
        </p>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: T.t2, fontSize: "12px", fontWeight: 600 }}>
          <span style={{ color: GOLD }}><Ic.Lock/></span> Vos données d&apos;identité restent privées
        </div>
      </div>

      {/* ── Pourquoi vérifier ── */}
      <div style={{ marginBottom: "20px" }}>
        <SectionTitre T={T}>Pourquoi vérifier mon identité ?</SectionTitre>
        <div style={{ backgroundColor: T.card, border: `1px solid ${T.brd}`, borderRadius: "16px", padding: "18px 20px" }}>
          {[
            "Renforcer la sécurité de votre compte",
            "Obtenir le badge « Vérifié »",
            "Renforcer la confiance auprès des établissements et partenaires",
            "Réduire les risques d'usurpation d'identité",
            "Accéder progressivement aux fonctionnalités nécessitant une identité vérifiée",
          ].map((txt, i, arr) => (
            <div key={txt} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: i === 0 ? "0 0 12px" : i === arr.length - 1 ? "12px 0 0" : "12px 0", borderTop: i > 0 ? `1px solid ${T.brd}` : "none" }}>
              <span style={{ color: GREEN, flexShrink: 0, marginTop: "1px" }}><Ic.CheckSm/></span>
              <span style={{ color: T.t1, fontSize: "13px", lineHeight: 1.5 }}>{txt}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Public / privé ── */}
      <div style={{ marginBottom: "20px" }}>
        <SectionTitre T={T}>Votre document reste privé</SectionTitre>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
          <div style={{ backgroundColor: T.isDark ? "rgba(34,197,94,0.06)" : "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: "14px", padding: "14px" }}>
            <div style={{ color: GREEN, fontSize: "10px", fontWeight: 800, letterSpacing: "0.5px", marginBottom: "8px" }}>PUBLIC SUR YELEN</div>
            {["Badge « Vérifié »", "Confirmation que votre identité est vérifiée"].map(txt => (
              <div key={txt} style={{ display: "flex", alignItems: "flex-start", gap: "6px", marginBottom: "6px" }}>
                <span style={{ color: GREEN, flexShrink: 0, marginTop: "2px" }}><Ic.CheckSm/></span>
                <span style={{ color: T.t1, fontSize: "12px", lineHeight: 1.4 }}>{txt}</span>
              </div>
            ))}
          </div>
          <div style={{ backgroundColor: T.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", border: `1px solid ${T.brd}`, borderRadius: "14px", padding: "14px" }}>
            <div style={{ color: T.t2, fontSize: "10px", fontWeight: 800, letterSpacing: "0.5px", marginBottom: "8px" }}>PRIVÉ</div>
            {["Pièce d'identité (recto, verso)", "Votre photo", "Numéro et informations du document", "Documents originaux envoyés"].map(txt => (
              <div key={txt} style={{ display: "flex", alignItems: "flex-start", gap: "6px", marginBottom: "6px" }}>
                <span style={{ color: T.t3, flexShrink: 0, marginTop: "2px" }}><Ic.Lock size={11}/></span>
                <span style={{ color: T.t2, fontSize: "12px", lineHeight: 1.4 }}>{txt}</span>
              </div>
            ))}
          </div>
        </div>
        <p style={{ color: T.t2, fontSize: "11.5px", lineHeight: 1.5, margin: 0, fontStyle: "italic" }}>
          Les établissements et autres utilisateurs ne peuvent pas consulter votre pièce d&apos;identité.
        </p>
      </div>

      {/* ── Étapes ── */}
      <div style={{ marginBottom: "20px" }}>
        <SectionTitre T={T}>Comment ça marche</SectionTitre>
        <div style={{ backgroundColor: T.card, border: `1px solid ${T.brd}`, borderRadius: "16px", padding: "6px 18px" }}>
          {[
            { n: "01", t: "Préparez votre CIN (recto et verso)" },
            { n: "02", t: "Photographiez le recto, le verso, puis vous-même" },
            { n: "03", t: "Yelen vérifie votre identité" },
          ].map((s, i) => (
            <div key={s.n} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: i > 0 ? `1px solid ${T.brd}` : "none" }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "9px", background: T.isDark ? "rgba(245,166,35,0.12)" : "rgba(245,166,35,0.1)", color: GOLD, fontSize: "11px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{s.n}</div>
              <span style={{ color: T.t1, fontSize: "13px", fontWeight: 600 }}>{s.t}</span>
            </div>
          ))}
        </div>
        <p style={{ color: T.t2, fontSize: "11.5px", lineHeight: 1.5, margin: "10px 0 0" }}>Vous serez informé dès que la vérification sera terminée.</p>
      </div>

      {/* ── Pièces acceptées ── */}
      <div style={{ marginBottom: "20px" }}>
        <SectionTitre T={T}>Pièces demandées</SectionTitre>
        <div style={{ backgroundColor: T.card, border: `1px solid ${T.brd}`, borderRadius: "16px", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {["Recto de la CIN", "Verso de la CIN", "Photo de vous"].map(txt => (
            <div key={txt} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: GOLD, flexShrink: 0 }}><Ic.CheckSm/></span>
              <span style={{ color: T.t1, fontSize: "13px", fontWeight: 600 }}>{txt}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", marginTop: "6px", paddingTop: "10px", borderTop: `1px solid ${T.brd}` }}>
            <span style={{ color: T.t2 }}>Formats acceptés (CIN)</span>
            <span style={{ color: T.t1, fontWeight: 600 }}>JPG · PNG · PDF</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px" }}>
            <span style={{ color: T.t2 }}>Taille maximale</span>
            <span style={{ color: T.t1, fontWeight: 600 }}>10 Mo par fichier</span>
          </div>
        </div>
      </div>

      {/* ── Erreur (validation locale ou envoi) ── */}
      {erreur && (
        <div style={{ background: T.isDark ? "rgba(239,68,68,0.08)" : "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "14px", padding: "14px 16px", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <span style={{ color: RED }}><Ic.Alert/></span>
            <span style={{ color: T.t1, fontSize: "13px", fontWeight: 800 }}>{erreur.titre}</span>
          </div>
          <p style={{ color: T.t2, fontSize: "12px", lineHeight: 1.5, margin: "0 0 10px" }}>{erreur.message}</p>
          <button className="tap" onClick={() => setErreur(null)} style={{ background: "none", border: "none", color: RED, fontSize: "12px", fontWeight: 800, cursor: "pointer", padding: 0 }}>
            Fermer
          </button>
        </div>
      )}

      {/* ── Zone d'upload par étape / confirmation finale ── */}
      <div style={{ marginBottom: "8px" }}>
        <SectionTitre T={T}>Envoyer vos documents</SectionTitre>

        {/* Progression 3 étapes */}
        <div style={{ display: "flex", justifyContent: "center", gap: "6px", marginBottom: "16px" }}>
          {SLOT_ORDER.map((s, i) => (
            <div key={s} style={{
              width: i === slotIndex && slotIndex < 3 ? "22px" : "6px", height: "6px", borderRadius: "3px",
              background: i < slotIndex || slotIndex === 3 ? GREEN : i === slotIndex ? GOLD : T.brd,
              transition: "all 0.2s",
            }}/>
          ))}
        </div>

        {slotIndex < 3 && meta && phase === "choix" && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); selectionner(e.dataTransfer.files?.[0] ?? null); }}
            style={{ backgroundColor: T.card, border: `1.5px dashed ${dragOver ? GOLD : T.brd}`, borderRadius: "18px", padding: "28px 20px", textAlign: "center" }}
          >
            <div style={{ color: GOLD, fontSize: "10.5px", fontWeight: 800, letterSpacing: "0.5px", marginBottom: "10px" }}>ÉTAPE {meta.n} · {meta.label.toUpperCase()}</div>
            <div style={{ color: GOLD, marginBottom: "14px", display: "flex", justifyContent: "center" }}>
              {currentSlot === "selfie" ? <Ic.User size={36}/> : <Ic.Shield size={36}/>}
            </div>
            <div style={{ color: T.t1, fontSize: "15px", fontWeight: 800, marginBottom: "4px" }}>{meta.intituleZone}</div>
            <div style={{ color: T.t2, fontSize: "12px", lineHeight: 1.5, marginBottom: "20px" }}>{meta.sousZone}</div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "260px", margin: "0 auto" }}>
              <button className="tap" onClick={() => setSheetMode("photo")} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: GOLD, color: "#080812", fontWeight: 800, fontSize: "13.5px", padding: "12px", borderRadius: "12px", border: "none", cursor: "pointer" }}>
                <Ic.Camera/> Prendre une photo
              </button>
              <button className="tap" onClick={() => setSheetMode("fichier")} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: T.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", color: T.t1, fontWeight: 700, fontSize: "13.5px", padding: "12px", borderRadius: "12px", border: `1px solid ${T.brd}`, cursor: "pointer" }}>
                <Ic.Folder/> Choisir dans mes fichiers
              </button>
            </div>

            <input ref={inputPhotoRef} type="file" accept={meta.acceptedMimes.filter(m => m !== "application/pdf").join(",")} capture={meta.captureAttr} onChange={(e) => selectionner(e.target.files?.[0] ?? null)} style={{ display: "none" }}/>
            <input ref={inputFichierRef} type="file" accept={meta.acceptedMimes.join(",")} onChange={(e) => selectionner(e.target.files?.[0] ?? null)} style={{ display: "none" }}/>
          </div>
        )}

        {sheetMode && currentSlot && (
          <GuideSheet
            T={T}
            slot={currentSlot}
            mode={sheetMode}
            onClose={() => setSheetMode(null)}
            onConfirm={() => {
              setSheetMode(null);
              (sheetMode === "photo" ? inputPhotoRef : inputFichierRef).current?.click();
            }}
          />
        )}

        {slotIndex < 3 && currentSlot && phase === "apercu" && files[currentSlot] && (
          <div style={{ backgroundColor: T.card, border: `1px solid ${T.brd}`, borderRadius: "18px", padding: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
              <div style={{ width: "56px", height: "56px", borderRadius: "12px", overflow: "hidden", background: T.card2, display: "flex", alignItems: "center", justifyContent: "center", color: T.t2, flexShrink: 0 }}>
                {previews[currentSlot] ? (
                  // IMG-EXCEPTION: reason=blob local créé par URL.createObjectURL, jamais téléversé tel quel | reviewed=2026-08-28
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previews[currentSlot]!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
                ) : <Ic.File size={24}/>}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: T.t2, fontSize: "10px", fontWeight: 800, letterSpacing: "0.5px" }}>{meta!.label.toUpperCase()}</div>
                <div style={{ color: T.t1, fontSize: "13px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{files[currentSlot]!.name}</div>
                <div style={{ color: T.t2, fontSize: "11.5px" }}>{formatTaille(files[currentSlot]!.size)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: "5px", color: GREEN, fontSize: "11px", fontWeight: 700, marginTop: "3px" }}><Ic.CheckSm/> Document chargé</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="tap" onClick={remplacer} style={{ flex: 1, background: T.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", color: T.t1, fontWeight: 700, fontSize: "13px", padding: "11px", borderRadius: "12px", border: `1px solid ${T.brd}`, cursor: "pointer" }}>Remplacer</button>
              <button className="tap" onClick={continuerVersSuivant} style={{ flex: 1, background: GOLD, color: "#080812", fontWeight: 800, fontSize: "13px", padding: "11px", borderRadius: "12px", border: "none", cursor: "pointer" }}>Continuer</button>
            </div>
          </div>
        )}

        {slotIndex === 3 && files.recto && files.verso && files.selfie && (
          <div style={{ backgroundColor: T.card, border: `1px solid ${T.brd}`, borderRadius: "18px", padding: "18px" }}>
            <div style={{ color: T.t1, fontSize: "14.5px", fontWeight: 800, marginBottom: "6px" }}>Vérifiez vos documents</div>
            <p style={{ color: T.t2, fontSize: "12.5px", lineHeight: 1.55, margin: "0 0 16px" }}>
              Assurez-vous que vos 3 photos sont nettes, complètes et lisibles avant l&apos;envoi.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
              {SLOT_ORDER.map((s, i) => {
                const f = files[s]!;
                const preview = previews[s];
                return (
                  <div key={s} style={{ display: "flex", alignItems: "center", gap: "10px", background: T.card2, borderRadius: "12px", padding: "8px 10px" }}>
                    <div style={{ width: "40px", height: "40px", borderRadius: "9px", overflow: "hidden", background: T.card, display: "flex", alignItems: "center", justifyContent: "center", color: T.t2, flexShrink: 0 }}>
                      {preview ? (
                        // IMG-EXCEPTION: reason=blob local créé par URL.createObjectURL, jamais téléversé tel quel | reviewed=2026-08-28
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
                      ) : <Ic.File size={18}/>}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ color: T.t1, fontSize: "11.5px", fontWeight: 800 }}>{SLOT_META[s].label}</div>
                      <div style={{ color: T.t2, fontSize: "10.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</div>
                    </div>
                    <button onClick={() => modifierEtape(i)} className="tap" style={{ background: "none", border: "none", color: GOLD, fontSize: "11.5px", fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>Modifier</button>
                  </div>
                );
              })}
            </div>

            <button
              disabled={busy}
              onClick={envoyer}
              className="tap"
              style={{ width: "100%", background: GOLD, color: "#080812", fontWeight: 800, fontSize: "14.5px", padding: "14px", borderRadius: "13px", border: "none", cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
            >
              {busy ? <><YelenLoader size={16} color="#080812"/> Envoi…</> : "Envoyer pour vérification"}
            </button>
          </div>
        )}
      </div>

      {/* ── Confidentialité ── */}
      <div style={{ marginTop: "28px", padding: "16px 4px 0", borderTop: `1px solid ${T.brd}` }}>
        <div style={{ color: T.t1, fontSize: "12.5px", fontWeight: 800, marginBottom: "6px" }}>Vos données sont protégées</div>
        <p style={{ color: T.t2, fontSize: "11.5px", lineHeight: 1.55, margin: "0 0 10px" }}>
          Les informations transmises dans le cadre de la vérification sont utilisées uniquement pour confirmer votre identité et sécuriser votre compte, conformément aux règles de confidentialité de Yelen.
        </p>
        <div style={{ display: "flex", gap: "16px" }}>
          <Link href="/confidentialite" style={{ color: GOLD, fontSize: "11.5px", fontWeight: 700, textDecoration: "none" }}>Politique de confidentialité</Link>
          <Link href="/cgu" style={{ color: GOLD, fontSize: "11.5px", fontWeight: 700, textDecoration: "none" }}>Conditions générales</Link>
        </div>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════
// Exemples d'illustration (recto/verso/selfie) — cartes vertes en pointillé
// façon viewfinder, réutilisées dans le sheet de guidage.
// ══════════════════════════════════════════════════════════════════
function ExempleCarte({ T, verso, label, image }: { T: Tokens; verso?: boolean; label: string; image?: string }) {
  if (image) {
    // Illustration Yelen sur mesure (07/09/2026) — déjà cadrée/badge ✓
    // intégrés dans l'image, donc pas de bordure pointillée verte ni de
    // badge ✓ du code par-dessus (contrairement au mock générique ci-dessous).
    return (
      <div style={{ maxWidth: "320px", margin: "0 auto" }}>
        <div style={{ position: "relative", width: "100%", aspectRatio: "1536/1024" }}>
          <Image src={image} alt="" fill style={{ objectFit: "contain" }}/>
        </div>
        <div style={{ textAlign: "center", color: T.t2, fontSize: "10.5px", fontWeight: 800, letterSpacing: "0.5px", marginTop: "6px" }}>{label}</div>
      </div>
    );
  }
  return (
    <div style={{ maxWidth: "170px", margin: "0 auto" }}>
      <div style={{ position: "relative", borderRadius: "12px", border: `1.5px dashed ${GREEN}`, padding: "8px", background: T.isDark ? "rgba(34,197,94,0.05)" : "rgba(34,197,94,0.04)" }}>
        <div style={{ color: T.t2, aspectRatio: "140/88" }}><Ic.IdMock verso={verso}/></div>
        <div style={{ position: "absolute", top: "-6px", right: "-6px", width: "18px", height: "18px", borderRadius: "50%", background: GREEN, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><Ic.CheckSm/></div>
      </div>
      <div style={{ textAlign: "center", color: T.t2, fontSize: "10.5px", fontWeight: 800, letterSpacing: "0.5px", marginTop: "6px" }}>{label}</div>
    </div>
  );
}

function ExempleFace({ T, image }: { T: Tokens; image?: string }) {
  if (image) {
    // Illustration Yelen sur mesure (07/09/2026) — même traitement que
    // ExempleCarte : cadrage/badge ✓ déjà intégrés dans l'image.
    return (
      <div style={{ maxWidth: "320px", margin: "0 auto" }}>
        <div style={{ position: "relative", width: "100%", aspectRatio: "1536/1024" }}>
          <Image src={image} alt="" fill style={{ objectFit: "contain" }}/>
        </div>
        <div style={{ textAlign: "center", color: T.t2, fontSize: "10.5px", fontWeight: 800, letterSpacing: "0.5px", marginTop: "6px" }}>VOTRE PHOTO</div>
      </div>
    );
  }
  return (
    <div style={{ maxWidth: "170px", margin: "0 auto" }}>
      <div style={{ position: "relative", borderRadius: "12px", border: `1.5px dashed ${GREEN}`, padding: "8px", background: T.isDark ? "rgba(34,197,94,0.05)" : "rgba(34,197,94,0.04)" }}>
        <div style={{ color: T.t2, aspectRatio: "140/88" }}><Ic.FaceMock/></div>
        <div style={{ position: "absolute", top: "-6px", right: "-6px", width: "18px", height: "18px", borderRadius: "50%", background: GREEN, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><Ic.CheckSm/></div>
      </div>
      <div style={{ textAlign: "center", color: T.t2, fontSize: "10.5px", fontWeight: 800, letterSpacing: "0.5px", marginTop: "6px" }}>VOTRE PHOTO</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// Sheet de guidage — affiché avant d'ouvrir la caméra ou le sélecteur de
// fichiers, propre à chaque étape (recto/verso/selfie) pour guider
// progressivement plutôt que tout expliquer d'un coup.
// ══════════════════════════════════════════════════════════════════
function GuideSheet({ T, slot, mode, onClose, onConfirm }: { T: Tokens; slot: Slot; mode: "photo" | "fichier"; onClose: () => void; onConfirm: () => void }) {
  const meta = SLOT_META[slot];
  const sousTitre = mode === "photo" ? "Avant de prendre la photo" : "Avant de choisir un fichier";
  const cta = mode === "photo" ? "Compris, prendre une photo" : "Compris, choisir un fichier";
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9200, backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", animation: "sheetFade 0.2s ease" }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, maxWidth: "560px", margin: "0 auto",
          backgroundColor: T.card, borderRadius: "22px 22px 0 0", padding: "10px 20px calc(20px + env(safe-area-inset-bottom))",
          maxHeight: "88svh", overflowY: "auto", animation: "sheetUp 0.28s cubic-bezier(0.32,0.72,0,1)",
        }}
      >
        <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: T.brd, margin: "0 auto 16px" }}/>

        <div style={{ display: "inline-flex", alignItems: "center", background: GOLD, color: "#080812", fontSize: "10.5px", fontWeight: 800, padding: "4px 10px", borderRadius: "20px", marginBottom: "10px" }}>
          Étape {meta.n}
        </div>
        <div style={{ color: T.t1, fontSize: "17px", fontWeight: 900, letterSpacing: "-0.2px", marginBottom: "2px" }}>{meta.guideTitre}</div>
        <div style={{ color: T.t2, fontSize: "12.5px", marginBottom: "16px" }}>{sousTitre}</div>

        <div style={{ marginBottom: "18px" }}>{meta.mock(T)}</div>

        <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginBottom: "14px" }}>
          {meta.dos.map(txt => (
            <div key={txt} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <span style={{ color: GREEN, flexShrink: 0, marginTop: "1px" }}><Ic.CheckSm/></span>
              <span style={{ color: T.t1, fontSize: "12.5px", lineHeight: 1.4 }}>{txt}</span>
            </div>
          ))}
        </div>

        <div style={{ background: T.isDark ? "rgba(239,68,68,0.07)" : "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "12px", padding: "10px 12px", marginBottom: "20px" }}>
          <div style={{ color: RED, fontSize: "11px", fontWeight: 800, marginBottom: "6px" }}>À éviter</div>
          {meta.donts.map(txt => (
            <div key={txt} style={{ display: "flex", alignItems: "flex-start", gap: "7px", marginTop: "4px" }}>
              <span style={{ color: RED, flexShrink: 0, marginTop: "1px" }}><Ic.X/></span>
              <span style={{ color: T.t2, fontSize: "12px", lineHeight: 1.4 }}>{txt}</span>
            </div>
          ))}
        </div>

        <button className="tap" onClick={onConfirm} style={{ width: "100%", background: GOLD, color: "#080812", fontWeight: 800, fontSize: "14px", padding: "14px", borderRadius: "13px", border: "none", cursor: "pointer", marginBottom: "8px" }}>
          {cta}
        </button>
        <button className="tap" onClick={onClose} style={{ width: "100%", background: "none", color: T.t2, fontWeight: 700, fontSize: "13px", padding: "8px", borderRadius: "12px", border: "none", cursor: "pointer" }}>
          Annuler
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// États terminaux
// ══════════════════════════════════════════════════════════════════
function EtatVerifie({ T, soumisLe }: { T: Tokens; soumisLe: string | null }) {
  return (
    <div style={{ backgroundColor: T.card, border: "1px solid rgba(34,197,94,0.3)", borderRadius: "18px", padding: "32px 20px", textAlign: "center" }}>
      <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "rgba(34,197,94,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", color: GREEN }}><Ic.Check size={26}/></div>
      <div style={{ color: T.t1, fontSize: "17px", fontWeight: 800, marginBottom: "6px" }}>Identité vérifiée</div>
      <div style={{ color: T.t2, fontSize: "13px", lineHeight: 1.5 }}>
        {soumisLe ? `Pièce soumise le ${formatDate(soumisLe)}.` : "Votre pièce a été soumise."} Le badge « Vérifié » est visible sur votre Yelen ID.
      </div>
    </div>
  );
}

// ── Suivi de progression Document reçu → Vérification → Décision.
// Toujours la même étape active ("Vérification") : le backend n'a qu'un
// seul statut "en_attente" entre la soumission et la décision, pas de
// sous-étapes distinctes — pas de fausse granularité inventée ici.
function ProgressTracker({ T }: { T: Tokens }) {
  const steps: { label: string; state: "done" | "current" | "pending" }[] = [
    { label: "Document reçu", state: "done" },
    { label: "Vérification", state: "current" },
    { label: "Décision", state: "pending" },
  ];
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center" }}>
        {steps.map((s, i) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", flex: i === steps.length - 1 ? "0 0 auto" : 1 }}>
            <div className={s.state === "current" ? "pulse-dot" : undefined} style={{
              width: "30px", height: "30px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              background: s.state === "done" ? GREEN : s.state === "current" ? GOLD : "transparent",
              border: s.state === "pending" ? `1.5px solid ${T.brd}` : "none",
              color: s.state === "pending" ? T.t3 : "#080812",
            }}>
              {s.state === "done" ? <Ic.CheckSm/> : s.state === "current" ? <Ic.Clock size={15}/> : <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: T.t3 }}/>}
            </div>
            {i < steps.length - 1 && <div style={{ flex: 1, height: "2px", background: s.state === "done" ? GREEN : T.brd, margin: "0 2px" }}/>}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", marginTop: "8px" }}>
        {steps.map((s, i) => (
          <div key={s.label} style={{ textAlign: i === 0 ? "left" : i === steps.length - 1 ? "right" : "center", fontSize: "10px", fontWeight: 700, color: s.state === "pending" ? T.t3 : T.t1 }}>
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function EtatEnAttente({ T, soumisLe }: { T: Tokens; soumisLe: string | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ backgroundColor: T.card, border: `1px solid ${T.brd}`, borderRadius: "18px", padding: "26px 20px 20px" }}>
        <ProgressTracker T={T}/>
      </div>

      <div style={{ textAlign: "center", padding: "4px 8px 0" }}>
        <div style={{ color: T.t1, fontSize: "19px", fontWeight: 900, letterSpacing: "-0.3px", marginBottom: "8px" }}>Votre identité est en cours de vérification</div>
        <p style={{ color: T.t2, fontSize: "13.5px", lineHeight: 1.55, margin: "0 auto", maxWidth: "360px" }}>
          Nous avons bien reçu votre document. Yelen vérifie actuellement les informations transmises afin de confirmer votre identité.
        </p>
      </div>

      <div style={{ backgroundColor: T.card, border: `1px solid ${T.brd}`, borderRadius: "16px", padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
          <span className="pulse-dot" style={{ width: "8px", height: "8px", borderRadius: "50%", background: GOLD, flexShrink: 0 }}/>
          <span style={{ color: T.t1, fontSize: "13.5px", fontWeight: 800 }}>Vérification en cours</span>
        </div>
        <p style={{ color: T.t2, fontSize: "12px", lineHeight: 1.5, margin: 0 }}>Votre document est actuellement examiné par Yelen.</p>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: T.card, border: `1px solid ${T.brd}`, borderRadius: "14px", padding: "14px 16px" }}>
        <span style={{ color: T.t2, fontSize: "12px", fontWeight: 700 }}>Document reçu</span>
        <span style={{ color: T.t1, fontSize: "12.5px", fontWeight: 700 }}>{soumisLe ? formatDateHeure(soumisLe) : "—"}</span>
      </div>

      <div style={{ backgroundColor: T.card, border: `1px solid ${T.brd}`, borderRadius: "16px", padding: "16px" }}>
        <div style={{ color: T.t1, fontSize: "13px", fontWeight: 800, marginBottom: "6px" }}>Et ensuite ?</div>
        <p style={{ color: T.t2, fontSize: "12px", lineHeight: 1.55, margin: 0 }}>
          Une fois la vérification terminée, vous recevrez une notification et votre badge « Vérifié » sera automatiquement mis à jour si votre identité est confirmée.
        </p>
      </div>

      <p style={{ textAlign: "center", color: T.t3, fontSize: "11.5px", lineHeight: 1.5, margin: 0, padding: "0 12px" }}>
        Vous pouvez quitter cette page — votre vérification continue automatiquement et l&apos;état sera à jour à votre retour.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center", background: T.isDark ? "rgba(245,166,35,0.08)" : "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.2)", borderRadius: "20px", padding: "10px 16px" }}>
        <span style={{ color: GOLD, flexShrink: 0 }}><Ic.Bell/></span>
        <span style={{ color: T.t1, fontSize: "11.5px", fontWeight: 600 }}>Nous vous préviendrons dès que la vérification sera terminée.</span>
      </div>
    </div>
  );
}

function EtatRefusee({ T, motif, onReessayer }: { T: Tokens; motif: string | null; onReessayer: () => void }) {
  return (
    <div style={{ backgroundColor: T.card, border: "1px solid rgba(239,68,68,0.3)", borderRadius: "18px", padding: "32px 20px", textAlign: "center" }}>
      <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "rgba(239,68,68,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", color: RED }}><Ic.Alert size={26}/></div>
      <div style={{ color: T.t1, fontSize: "17px", fontWeight: 800, marginBottom: "6px" }}>Document refusé</div>
      <p style={{ color: T.t2, fontSize: "13px", lineHeight: 1.55, margin: "0 auto 20px", maxWidth: "360px" }}>
        {motif || "Votre document n'a pas pu être validé. Reprenez une photo nette, avec le document entièrement visible."}
      </p>
      <button onClick={onReessayer} className="tap" style={{ background: GOLD, color: "#080812", fontWeight: 800, fontSize: "13.5px", padding: "12px 24px", borderRadius: "12px", border: "none", cursor: "pointer" }}>
        Réessayer
      </button>
    </div>
  );
}
