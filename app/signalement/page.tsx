"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Inter } from "next/font/google";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "@/lib/theme";

// Auto-hébergée (Lot 1.5, 13/08/2026) — voir app/ambassades/page.tsx pour
// le raisonnement complet.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800", "900"], variable: "--font-inter" });
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { YelenLoader } from "@/components/YelenLoader";
import { CompteHeader } from "@/components/CompteEcranVide";
import { SIGNALEMENT_STATUTS, SIGNALEMENT_STATUT_LABELS, SIGNALEMENT_MOTIFS_CITOYEN } from "@/lib/signalementsConstants";

// ─── Types ────────────────────────────────────────────────────────────────────

type Signalement = {
  id: string;
  motif: string;
  description: string | null;
  preuve_url: string | null;
  statut: string;
  created_at: string;
  institution_id: string;
  institution_name?: string;
  institution_logo?: string | null;
  rdv_date?: string | null;
  rdv_heure?: string | null;
  rdv_objet?: string | null;
};
type RdvOption = { id: string; objet: string | null; date_rdv: string; heure_rdv: string };
type SuiviEvent = { type: string; statut: string | null; created_at: string };

// ─── Constantes ───────────────────────────────────────────────────────────────

// Source unique désormais lib/signalementsConstants.ts (chantier RDV
// obligatoire + nettoyage emoji, 15/08/2026) — le nom local MOTIFS_CITOYEN
// est conservé pour ne pas toucher aux usages existants dans ce fichier.
const MOTIFS_CITOYEN = SIGNALEMENT_MOTIFS_CITOYEN;

// Libellés statut côté citoyen (V2 "Mes signalements", 11/09/2026) —
// distincts de SIGNALEMENT_STATUT_LABELS (jargon interne institution/admin,
// ex. "À traiter", "En attente"), reformulés pour être compréhensibles sans
// ouvrir le dossier. a_traiter/en_cours se confondent volontairement en
// "En cours d'examen" (un citoyen n'a pas besoin de distinguer "en file
// d'attente" de "en cours de traitement actif"), idem rejete/doublon → même
// "Rejeté" (le détail explique le motif exact). Couleur inchangée
// (SIG_STATUT_CFG côté institution garde ses propres libellés internes).
const STATUT_LABEL_CITOYEN: Record<string, string> = {
  nouveau: "Nouveau",
  a_traiter: "En cours d'examen",
  en_cours: "En cours d'examen",
  en_attente: "Informations complémentaires",
  resolu: "Traité",
  cloture: "Clôturé",
  rejete: "Rejeté",
  doublon: "Rejeté",
};

const STATUT_CFG: Record<string, { label: string; color: string; bg: string; border: string }> =
  Object.fromEntries(SIGNALEMENT_STATUTS.map(s => {
    const traite = s === "resolu" || s === "cloture";
    const ecarte = s === "rejete" || s === "doublon";
    const label = STATUT_LABEL_CITOYEN[s] || SIGNALEMENT_STATUT_LABELS[s];
    // "Nouveau" — fond plein doré Yelen, même couleur exacte que les
    // boutons CTA (retour Bryan 11/09/2026), pas la teinte pâle partagée
    // par les autres statuts non terminaux (a_traiter/en_cours/en_attente
    // restent en teinte légère, inchangés).
    if (s === "nouveau") return [s, { label, color: "#1a1200", bg: "#F5A623", border: "#F5A623" }];
    const color = traite ? "#22c55e" : ecarte ? "#ef4444" : "#F5A623";
    return [s, {
      label,
      color,
      bg: traite ? "rgba(34,197,94,0.08)" : ecarte ? "rgba(239,68,68,0.08)" : "rgba(245,166,35,0.08)",
      border: traite ? "rgba(34,197,94,0.25)" : ecarte ? "rgba(239,68,68,0.25)" : "rgba(245,166,35,0.25)",
    }];
  }));

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

// Ligne "résumé + sheet" réutilisée par Institution/Rendez-vous/Motif (V2
// progressive disclosure, retour Bryan 11/09/2026) — un seul champ visible
// à la fois plutôt qu'un long formulaire vertical, chaque valeur choisie
// dans un sheet dédié. Définie au niveau module (pas dans SignalementInner)
// pour éviter le piège React de perte de focus des composants redéfinis à
// chaque rendu.
function LigneChoix({ label, value, subvalue, placeholder, onClick, C, theme, filled }: {
  label: string; value: string | null; subvalue?: string | null; placeholder: string;
  onClick: () => void; C: ThemeTokens; theme: "light" | "dark"; filled?: boolean;
}) {
  return (
    <div>
      <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: C.textSubtle, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: "8px", fontWeight: 600 as const }}>
        {label}
        {filled && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
      </label>
      <button
        type="button" onClick={onClick} className="tap"
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px",
          backgroundColor: theme === "dark" ? "rgba(255,255,255,0.04)" : "#f9f9fb",
          border: `1px solid ${C.borderCard}`, borderRadius: "10px", padding: "12px 14px",
          fontFamily: "inherit", cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "block", fontSize: "14px", fontWeight: 600, color: value ? C.text : C.textSubtle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value || placeholder}</span>
          {subvalue && <span style={{ display: "block", fontSize: "12px", color: C.textSubtle, marginTop: "2px" }}>{subvalue}</span>}
        </span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.textFaint} strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="m9 18 6-6-6-6"/></svg>
      </button>
    </div>
  );
}

// En-tête de chaque étape empilée du parcours "Nouveau signalement" —
// question + phrase d'instruction, chaque étape restant visible une fois
// remplie (retour Bryan 11/09/2026, stack progressif).
function StepHeading({ titre, instruction, C }: { titre: string; instruction: string; C: ThemeTokens }) {
  return (
    <div style={{ marginBottom: "16px" }}>
      <h2 style={{ fontSize: "19px", fontWeight: 800, color: C.text, margin: "0 0 6px", lineHeight: 1.3 }}>{titre}</h2>
      <p style={{ fontSize: "13px", color: C.textSubtle, margin: 0, lineHeight: 1.5 }}>{instruction}</p>
    </div>
  );
}

// ─── Inner Component ──────────────────────────────────────────────────────────

function SignalementInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const institutionIdParam = searchParams.get("institution_id");
  const rdvIdParam = searchParams.get("rdv_id");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { theme } = useTheme();
  const C = T[theme];

  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<"nouveau" | "historique">("historique");
  const [motif, setMotif] = useState("");
  const [motifAutre, setMotifAutre] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [institutionId, setInstitutionId] = useState(institutionIdParam || "");
  const [institutions, setInstitutions] = useState<{ id: string; name: string; logo: string | null }[]>([]);
  const [rdvId, setRdvId] = useState("");
  const [rdvsEligibles, setRdvsEligibles] = useState<RdvOption[]>([]);
  const [loadingRdvs, setLoadingRdvs] = useState(false);
  const [introOpen, setIntroOpen] = useState(true);
  const [nouveauIntroOpen, setNouveauIntroOpen] = useState(false);
  const [institutionSheetOpen, setInstitutionSheetOpen] = useState(false);
  const [institutionSearch, setInstitutionSearch] = useState("");
  const [rdvSheetOpen, setRdvSheetOpen] = useState(false);
  const [motifSheetOpen, setMotifSheetOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [detailSig, setDetailSig] = useState<Signalement | null>(null);
  const [detailSuivi, setDetailSuivi] = useState<SuiviEvent[]>([]);
  const [loadingSuivi, setLoadingSuivi] = useState(false);
  const [historique, setHistorique] = useState<Signalement[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingHist, setLoadingHist] = useState(false);
  const [success, setSuccess] = useState(false);
  const [numeroPublic, setNumeroPublic] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let uid: string | null = null;
    try { uid = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!uid) { router.push("/login"); return; }
    setUserId(uid);
    fetchInstitutions();
    fetchHistorique();
  }, []);

  // Pop d'intro "Nouveau signalement" — distinct du sheet d'intro général
  // de l'écran (introOpen, une seule fois à l'ouverture du Centre de
  // signalement). Celui-ci se redéclenche à chaque fois que l'onglet
  // "Nouveau signalement" devient actif (retour Bryan 11/09/2026), y
  // compris au tout premier chargement puisque cet onglet est actif par
  // défaut.
  useEffect(() => {
    if (tab === "nouveau") setNouveauIntroOpen(true);
  }, [tab]);

  const fetchInstitutions = async () => {
    const { data } = await supabase
      .from("institutions")
      .select("id, name, logo")
      .eq("statut", "validee")
      .order("name");
    setInstitutions(data || []);
  };

  // RDV éligibles pour l'institution choisie — un signalement doit
  // documenter un fait précis, donc seuls les RDV déjà passés ou en cours
  // (date/heure atteinte) sont proposés, même règle que côté institution
  // (SignalementsTab.tsx / rdv-eligibles/route.ts). RLS `auth.uid() =
  // citoyen_id` déjà en place sur `rdv`, requête directe légitime ici.
  useEffect(() => {
    // Le motif est reset avec le RDV (V2, 11/09/2026) : le sheet Motif
    // n'est révélé qu'une fois un rendez-vous choisi, un motif resté en
    // mémoire d'une institution précédente réafficherait sinon la suite du
    // flux sans repasser par cette étape.
    setRdvId(""); setRdvsEligibles([]); setMotif(""); setMotifAutre("");
    if (!institutionId || !userId) return;
    setLoadingRdvs(true);
    (async () => {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const nowTime = now.toTimeString().slice(0, 5);
      const { data } = await supabase
        .from("rdv")
        .select("id, objet, date_rdv, heure_rdv")
        .eq("citoyen_id", userId)
        .eq("institution_id", institutionId)
        .lte("date_rdv", todayStr)
        .order("date_rdv", { ascending: false })
        .order("heure_rdv", { ascending: false })
        .limit(30);
      const eligibles = (data || []).filter(r => r.date_rdv < todayStr || r.heure_rdv <= nowTime);
      setRdvsEligibles(eligibles);
      if (rdvIdParam && eligibles.some(r => r.id === rdvIdParam)) setRdvId(rdvIdParam);
      setLoadingRdvs(false);
    })();
  }, [institutionId, userId, rdvIdParam]);

  const fetchHistorique = async () => {
    setLoadingHist(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setLoadingHist(false); return; }
    const res = await fetch(`/api/citoyen/signalements?accessToken=${encodeURIComponent(session.access_token)}`);
    const json = await res.json().catch(() => null);
    if (res.ok && json?.signalements) setHistorique(json.signalements);
    setLoadingHist(false);
  };

  // Suivi (timeline) — chargé à la demande à l'ouverture du détail (V2,
  // 11/09/2026), pas pour chaque ligne de la liste. Voir
  // app/api/citoyen/signalements/route.ts::EVENTS_CITOYEN_SAFE pour le
  // filtrage des types d'événements exposés.
  useEffect(() => {
    if (!detailSig) { setDetailSuivi([]); return; }
    setLoadingSuivi(true);
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setLoadingSuivi(false); return; }
      const res = await fetch(`/api/citoyen/signalements?accessToken=${encodeURIComponent(session.access_token)}&id=${detailSig.id}`);
      const json = await res.json().catch(() => null);
      if (res.ok && json?.suivi) setDetailSuivi(json.suivi);
      setLoadingSuivi(false);
    })();
  }, [detailSig]);

  // Étape intermédiaire V2 (11/09/2026) — remplace l'ancien envoi direct
  // depuis le formulaire : seule la description est encore à vérifier ici,
  // institution/rdv/motif sont déjà garantis remplis puisque chaque étape
  // suivante n'est révélée qu'une fois la précédente choisie.
  const handleContinuerVersRevue = () => {
    setError("");
    if (motif === "autre" && !motifAutre.trim()) { setError("Précisez votre motif."); return; }
    if (!description.trim() || description.trim().length < 20) { setError("Décrivez le problème en au moins 20 caractères."); return; }
    setReviewOpen(true);
  };

  const handleSubmit = async () => {
    setError("");
    if (!institutionId) { setError("Sélectionnez une institution."); return; }
    if (!rdvId) { setError("Sélectionnez le rendez-vous concerné."); return; }
    if (!motif) { setError("Choisissez un motif de signalement."); return; }
    if (motif === "autre" && !motifAutre.trim()) { setError("Précisez votre motif."); return; }
    if (!description.trim() || description.length < 20) { setError("Décrivez le problème en au moins 20 caractères."); return; }
    if (!userId) return;

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError("Session expirée, reconnectez-vous."); setLoading(false); return; }

      // Motif "autre" : pas de colonne dédiée sur `signalements` (retour
      // Bryan 11/09/2026, décision explicite de ne pas migrer la table pour
      // ça) — le texte libre est fondu en tête de la description envoyée,
      // `motif` reste "autre" côté institution/admin.
      const descriptionEnvoyee = motif === "autre" && motifAutre.trim()
        ? `Motif précisé : ${motifAutre.trim()}\n\n${description.trim()}`
        : description.trim();

      const form = new FormData();
      form.set("accessToken", session.access_token);
      form.set("institution_id", institutionId);
      form.set("rdv_id", rdvId);
      form.set("motif", motif);
      form.set("description", descriptionEnvoyee);
      if (imageFile) form.set("file", imageFile);

      const res = await fetch("/api/citoyen/signalements", { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) { setError(json?.error || "Erreur lors de l'envoi. Réessayez."); setLoading(false); return; }

      setSuccess(true);
      setNumeroPublic(json.numeroPublic || null);
      setReviewOpen(false);
      fetchHistorique();
      setRdvId(""); setMotif(""); setMotifAutre(""); setDescription(""); setImageFile(null); setImagePreview(null);
    } catch {
      setError("Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

  // ─── Styles dynamiques ────────────────────────────────────────────────────

  const inputStyle = {
    width: "100%",
    backgroundColor: theme === "dark" ? "rgba(255,255,255,0.04)" : "#f9f9fb",
    border: `1px solid ${C.borderCard}`,
    borderRadius: "10px",
    padding: "12px 14px",
    color: C.text,
    fontSize: "14px",
    fontFamily: "inherit",
  };

  const labelStyle = {
    display: "block",
    fontSize: "11px",
    color: C.textSubtle,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    marginBottom: "8px",
    fontWeight: "600" as const,
  };

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .tap { transition: transform 0.1s, opacity 0.1s; cursor: pointer; touch-action: manipulation; }
        .tap:active { opacity: 0.65; transform: scale(0.97); }
        textarea:focus, select:focus, input:focus { outline: none; border-color: #F5A623 !important; box-shadow: 0 0 0 3px rgba(245,166,35,0.12) !important; }
        .tab-btn { transition: all 0.15s ease; }
      `}</style>

      <div className={inter.variable} style={{ minHeight: "100vh", backgroundColor: C.pageBg, color: C.text, fontFamily: "var(--font-inter), -apple-system, sans-serif", paddingBottom: "60px", transition: "background-color 0.3s ease, color 0.3s ease" }}>

        {/* ── HEADER — standard des ~29 écrans /compte/*, plus de header
            maison (retour Bryan, 15/08/2026) ── */}
        <CompteHeader titre="Centre de signalement"/>

        <div style={{ maxWidth: "680px", margin: "0 auto", padding: "20px 20px 0" }}>

          {/* ── TABS ── */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
            {(["historique", "nouveau"] as const).map(t => (
              <button
                key={t}
                className="tab-btn"
                onClick={() => setTab(t)}
                style={{
                  flex: 1, padding: "10px 12px", borderRadius: "10px",
                  border: `1px solid ${tab === t ? (theme === "dark" ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)") : C.borderCard}`,
                  backgroundColor: tab === t ? (theme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)") : C.cardBg,
                  color: tab === t ? C.text : C.textSubtle,
                  fontSize: "13px", fontWeight: tab === t ? "700" : "500", cursor: "pointer",
                }}
              >
                {t === "nouveau" ? "Nouveau signalement" : "Mes signalements"}
              </button>
            ))}
          </div>

          {/* ══ NOUVEAU SIGNALEMENT ══ */}
          {tab === "nouveau" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px", animation: "fadeUp 0.2s ease" }}>

              {/* Stack progressif (retour Bryan 11/09/2026) : chaque étape
                  validée reste affichée, la suivante apparaît en dessous dès
                  que la précédente est remplie — remplace le wizard "un pas
                  à la fois" testé plus tôt dans la même session (un seul
                  écran remplacé à chaque étape). Chaque LigneChoix déjà
                  remplie reste cliquable pour rouvrir son sheet et changer
                  la valeur (résumé compact modifiable, retour Bryan). Même
                  métier qu'avant (mêmes validations dans handleSubmit), seule
                  la présentation change. */}
              <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
                <div>
                  {/* En-tête masquée une fois l'étape remplie (retour Bryan
                      11/09/2026, "plus fluide") — seul le label de la
                      LigneChoix reste, avec un ✅ sur sa ligne. */}
                  {!institutionId && <StepHeading titre="Quelle institution est concernée ?" instruction="Sélectionnez l'institution avec laquelle vous avez eu le rendez-vous." C={C}/>}
                  <LigneChoix
                    label="Institution concernée *"
                    value={institutions.find(i => i.id === institutionId)?.name || null}
                    placeholder="Sélectionner une institution..."
                    onClick={() => { setInstitutionSearch(""); setInstitutionSheetOpen(true); }}
                    C={C} theme={theme}
                    filled={!!institutionId}
                  />
                </div>

                {institutionId && (
                  <div style={{ animation: "fadeUp 0.25s ease" }}>
                    {!rdvId && <StepHeading titre="Quel rendez-vous est concerné ?" instruction="Choisissez le rendez-vous au cours duquel la situation s'est produite." C={C}/>}
                    {loadingRdvs ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", color: C.textSubtle, fontSize: "12.5px" }}>
                        <YelenLoader size={14}/> Chargement de vos rendez-vous…
                      </div>
                    ) : rdvsEligibles.length === 0 ? (
                      <div>
                        <label style={labelStyle}>Rendez-vous concerné *</label>
                        <div style={{ backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "10px", padding: "14px 16px" }}>
                          <p style={{ fontSize: "13px", fontWeight: "700", color: C.text, margin: "0 0 4px" }}>Aucun rendez-vous disponible</p>
                          <p style={{ fontSize: "12px", color: C.textSubtle, margin: 0, lineHeight: "1.5" }}>Un signalement doit concerner un fait survenu lors d&apos;un rendez-vous avec cette institution.</p>
                        </div>
                      </div>
                    ) : (
                      <LigneChoix
                        label="Rendez-vous concerné *"
                        value={rdvId ? (() => { const r = rdvsEligibles.find(x => x.id === rdvId); return r ? `${formatDate(r.date_rdv)} · ${r.heure_rdv?.slice(0, 5)}` : null; })() : null}
                        subvalue={rdvId ? (rdvsEligibles.find(x => x.id === rdvId)?.objet || "RDV général") : null}
                        placeholder="Sélectionner le rendez-vous..."
                        onClick={() => setRdvSheetOpen(true)}
                        C={C} theme={theme}
                        filled={!!rdvId}
                      />
                    )}
                  </div>
                )}

                {rdvId && (
                  <div style={{ animation: "fadeUp 0.25s ease" }}>
                    {!motif && <StepHeading titre="Que souhaitez-vous signaler ?" instruction="Sélectionnez le motif qui correspond le mieux à la situation." C={C}/>}
                    <LigneChoix
                      label="Motif du signalement *"
                      value={motif ? (motif === "autre" && motifAutre.trim() ? motifAutre.trim() : (MOTIFS_CITOYEN.find(m => m.value === motif)?.label || motif)) : null}
                      placeholder="Sélectionner un motif..."
                      onClick={() => setMotifSheetOpen(true)}
                      C={C} theme={theme}
                      filled={!!motif}
                    />
                  </div>
                )}

                {motif && (motif !== "autre" || motifAutre.trim()) && (
                  <div style={{ animation: "fadeUp 0.25s ease" }}>
                    <StepHeading titre="Que s'est-il passé ?" instruction="Décrivez les faits survenus lors de ce rendez-vous." C={C}/>

                    <div style={{ marginBottom: "20px" }}>
                      <label style={labelStyle}>
                        Décrivez ce qui s&apos;est passé * <span style={{ color: C.textFaint, textTransform: "none", letterSpacing: 0, fontWeight: "500" }}>(min. 20 caractères)</span>
                      </label>
                      <textarea
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        rows={4}
                        placeholder="Expliquez brièvement les faits rencontrés lors de ce rendez-vous…"
                        style={{ ...inputStyle, resize: "none", lineHeight: "1.6" }}
                      />
                      <p style={{ fontSize: "11px", color: description.length >= 20 ? "#22c55e" : C.textFaint, marginTop: "4px", textAlign: "right", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px" }}>
                        {description.length} caractères {description.length >= 20
                          ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          : `(${20 - description.length} manquants)`}
                      </p>
                    </div>

                    <div style={{ marginBottom: "20px" }}>
                      <label style={labelStyle}>Ajouter une pièce justificative (optionnel)</label>
                      {imagePreview ? (
                        <div style={{ position: "relative", display: "inline-block" }}>
                          {/* IMG-EXCEPTION: reason=aperçu blob local (URL.createObjectURL) avant envoi, non fetchable par l'optimiseur next/image | reviewed=2026-08-08 */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={imagePreview} style={{ height: "80px", borderRadius: "8px", objectFit: "cover", border: `1px solid ${C.borderCard}` }} alt="" />
                          <button
                            onClick={() => { setImageFile(null); setImagePreview(null); }}
                            style={{ position: "absolute", top: "-8px", right: "-8px", backgroundColor: "#ef4444", border: "none", color: "#fff", width: "22px", height: "22px", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                          ><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                        </div>
                      ) : (
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          style={{ width: "100%", backgroundColor: C.cardBg, border: `1px dashed ${C.borderCard}`, borderRadius: "10px", padding: "20px", color: C.textSubtle, fontSize: "13px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}
                        >
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="1.8" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                          <span>Photo, document ou autre élément utile</span>
                          <span style={{ fontSize: "11px", color: C.textFaint }}>JPG, PNG — max 5MB</span>
                        </button>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setImageFile(file);
                          setImagePreview(URL.createObjectURL(file));
                        }}
                        style={{ display: "none" }}
                      />
                    </div>

                    {error && (
                      <div style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "10px", padding: "12px 16px", color: "#ef4444", fontSize: "13px", marginBottom: "16px" }}>
                        {error}
                      </div>
                    )}

                    {/* Pas d'avance automatique ici (retour Bryan 11/09/2026)
                        — contrairement aux étapes de sélection, la
                        description doit être terminée. Le bouton n'apparaît
                        qu'au seuil des 20 caractères, jamais avant. */}
                    {description.trim().length >= 20 && (
                      <button
                        onClick={handleContinuerVersRevue}
                        className="tap"
                        style={{ width: "100%", backgroundColor: "#F5A623", border: "none", borderRadius: "12px", padding: "14px", color: "#1a1200", fontSize: "15px", fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                      >
                        Vérifier mon signalement
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══ HISTORIQUE ══ */}
          {tab === "historique" && (
            <div style={{ animation: "fadeUp 0.2s ease" }}>
              {/* En-tête "Mes signalements" (V2, 11/09/2026) — titre + une
                  ligne de contexte, un compteur texte simple, jamais un
                  dashboard/statistiques ("pas besoin de ça" — retour Bryan). */}
              <h2 style={{ fontSize: "18px", fontWeight: 800, color: C.text, margin: "0 0 4px" }}>Mes signalements</h2>
              <p style={{ fontSize: "13px", color: C.textSubtle, margin: "0 0 4px" }}>Suivez l&apos;avancement de vos signalements.</p>
              {!loadingHist && historique.length > 0 && (
                <p style={{ fontSize: "12px", color: C.textFaint, margin: "0 0 18px" }}>{historique.length} signalement{historique.length > 1 ? "s" : ""}</p>
              )}
              {loadingHist ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
                  <div style={{ width: "32px", height: "32px", border: `3px solid ${C.borderSubtle}`, borderTopColor: "#F5A623", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                </div>
              ) : historique.length === 0 ? (
                /* État vide V2 (11/09/2026, retour Bryan) — illustration +
                   explications structurées plutôt qu'une simple icône +
                   une ligne. Bloc "Comment ça marche ?" repris du même
                   modèle que "Que se passe-t-il maintenant ?" du sheet de
                   confirmation (icône + texte), mêmes faits vérifiés (48h
                   ouvrées, suivi consultable ici — jamais de notification
                   promise au citoyen, voir sheet de confirmation). */
                <div style={{ textAlign: "center", padding: "20px 8px 8px", animation: "fadeUp 0.2s ease" }}>
                  <Image src="/illustrations/signalement-vide.png" alt="" width={1536} height={1024} style={{ width: "220px", maxWidth: "100%", height: "auto", margin: "0 auto 18px", display: "block" }}/>
                  <p style={{ fontSize: "16px", fontWeight: 800, color: C.text, margin: "0 0 6px" }}>Aucun signalement envoyé</p>
                  <p style={{ fontSize: "13px", color: C.textSubtle, lineHeight: 1.6, margin: "0 0 22px" }}>
                    Vous n&apos;avez jamais eu besoin de signaler un problème. Si la situation se présente, voici comment ça se passe.
                  </p>

                  <div style={{ textAlign: "left", border: `1px solid ${C.borderSubtle}`, borderRadius: "14px", padding: "16px 18px", marginBottom: "20px" }}>
                    <p style={{ fontSize: "11px", fontWeight: 800, color: C.text, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 12px" }}>Comment ça marche ?</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {[
                        { icon: <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></>, texte: "Signalez un problème réel rencontré lors d'un rendez-vous avec une institution." },
                        { icon: <><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>, texte: "Votre signalement est examiné sous 48h ouvrées." },
                        { icon: <><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>, texte: "Vous pouvez suivre son avancement ici à tout moment." },
                      ].map((etape, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                          <span style={{ flexShrink: 0, marginTop: "1px", color: C.textSubtle }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{etape.icon}</svg>
                          </span>
                          <p style={{ fontSize: "12.5px", color: C.textSubtle, lineHeight: 1.6, margin: 0 }}>{etape.texte}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => setTab("nouveau")}
                    className="tap"
                    style={{ width: "100%", backgroundColor: "#F5A623", border: "none", borderRadius: "12px", padding: "14px", color: "#1a1200", fontSize: "14.5px", fontWeight: "700", cursor: "pointer" }}
                  >
                    Faire un signalement
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {/* Carte V2 (11/09/2026) — identification + rendez-vous
                      concerné + statut, plus de gros extrait de description
                      ni d'aperçu preuve dans la liste (retour Bryan : "la
                      liste = identification + état + contexte ; le détail =
                      contenu complet + suivi"). Motif en gris neutre, plus
                      de rouge décoratif (voir demande précédente). */}
                  {historique.map(s => {
                    const cfg = STATUT_CFG[s.statut] || STATUT_CFG.nouveau;
                    const motifLabel = MOTIFS_CITOYEN.find(m => m.value === s.motif)?.label || s.motif;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setDetailSig(s)}
                        className="tap"
                        style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer", backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "14px", padding: "16px 18px", animation: "fadeUp 0.2s ease", fontFamily: "inherit" }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                          <p style={{ fontSize: "14px", fontWeight: "700", color: C.text, margin: 0 }}>{s.institution_name}</p>
                          <span style={{ color: C.textFaint, flexShrink: 0 }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg></span>
                        </div>
                        <p style={{ fontSize: "12.5px", color: C.textSubtle, margin: "2px 0 12px" }}>{motifLabel}</p>

                        {s.rdv_date && (
                          <div style={{ marginBottom: "12px" }}>
                            <p style={{ fontSize: "13px", fontWeight: 600, color: C.text, margin: 0 }}>{formatDate(s.rdv_date)}{s.rdv_heure ? ` · ${s.rdv_heure.slice(0, 5)}` : ""}</p>
                            <p style={{ fontSize: "12px", color: C.textSubtle, margin: "1px 0 0" }}>{s.rdv_objet || "RDV général"}</p>
                          </div>
                        )}

                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                          <span style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color, fontSize: "11px", fontWeight: "700", padding: "4px 10px", borderRadius: "20px", flexShrink: 0 }}>
                            {cfg.label}
                          </span>
                          <span style={{ fontSize: "11px", color: C.textFaint }}>#{s.id.slice(0, 8).toUpperCase()}</span>
                        </div>
                        <p style={{ fontSize: "11px", color: C.textFaint, margin: "8px 0 0" }}>Signalé le {formatDate(s.created_at)}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── POP D'INTRO "NOUVEAU SIGNALEMENT" — V2 (11/09/2026, retour
          Bryan) : distinct du sheet d'intro général de l'écran ci-dessous.
          Plein écran opaque (pas de formulaire visible derrière), se
          redéclenche à chaque ouverture de l'onglet "Nouveau signalement"
          (voir useEffect([tab]) plus haut) — pas un affichage unique comme
          le sheet général. X ferme l'écran entier (router.back()),
          "Commençons" révèle le formulaire en dessous. ── */}
      {nouveauIntroOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9500, backgroundColor: C.pageBg, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "16px 16px 0", flexShrink: 0 }}>
            <button
              onClick={() => router.back()}
              aria-label="Fermer"
              className="tap"
              style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: theme === "dark" ? "rgba(255,255,255,0.06)" : "#f2f2f7", border: "none", color: C.textSubtle, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "20px 28px" }}>
            <div style={{ position: "relative", width: "180px", aspectRatio: "1024 / 1536", marginBottom: "28px" }}>
              <Image src="/illustrations/signalement-nouveau-intro.png" alt="" fill sizes="180px" style={{ objectFit: "contain" }}/>
            </div>

            <h2 style={{ fontSize: "20px", fontWeight: 800, color: C.text, textAlign: "center", margin: "0 0 12px", lineHeight: 1.3 }}>
              Une nouvelle situation mérite l&apos;attention de Yelen.
            </h2>
            <p style={{ fontSize: "14px", color: C.textMuted, lineHeight: 1.6, textAlign: "center", margin: "0 0 18px" }}>
              Vous pouvez nous signaler un problème rencontré lors d&apos;un rendez-vous avec une institution.
            </p>
            <p style={{ fontSize: "12.5px", color: C.textSubtle, lineHeight: 1.6, textAlign: "center", margin: 0 }}>
              Nous vous guiderons étape par étape pour nous permettre de comprendre la situation et de l&apos;examiner correctement.
            </p>
          </div>

          <div style={{ flexShrink: 0, padding: "16px 24px calc(20px + env(safe-area-inset-bottom))" }}>
            <button
              onClick={() => setNouveauIntroOpen(false)}
              className="tap"
              style={{ width: "100%", backgroundColor: "#F5A623", border: "none", borderRadius: "14px", padding: "15px", color: "#1a1200", fontSize: "15px", fontWeight: 800, cursor: "pointer" }}
            >
              Commençons
            </button>
          </div>
        </div>
      )}

      {/* ── SHEET D'INTRO GÉNÉRAL DE L'ÉCRAN — restauré tel qu'avant
          (retour Bryan 11/09/2026 : "remets le sheet de l'écran", distinct
          du pop ci-dessus). Affiché une seule fois à l'ouverture du Centre
          de signalement (introOpen), pas lié à un onglet précis — zIndex
          supérieur au pop "Nouveau signalement" pour s'afficher par-dessus
          au tout premier chargement (les deux sont vrais en même temps
          puisque l'onglet actif par défaut est "nouveau"). ── */}
      {introOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9550, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end" }}>
          <div style={{ width: "100%", maxWidth: "560px", margin: "0 auto", backgroundColor: C.cardBg, borderTopLeftRadius: "24px", borderTopRightRadius: "24px", padding: "24px 24px calc(24px + env(safe-area-inset-bottom))", animation: "sheetUp 0.28s cubic-bezier(0.22,1,0.36,1)", position: "relative" }}>
            <button
              onClick={() => router.back()}
              aria-label="Fermer"
              className="tap"
              style={{ position: "absolute", top: "18px", right: "18px", width: "32px", height: "32px", borderRadius: "50%", backgroundColor: theme === "dark" ? "rgba(255,255,255,0.06)" : "#f2f2f7", border: "none", color: C.textSubtle, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>

            <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}>
              <Image src="/illustrations/signalement-intro.png" alt="" width={1254} height={1254} style={{ width: "132px", height: "132px", objectFit: "contain" }}/>
            </div>

            <h2 style={{ fontSize: "20px", fontWeight: 800, color: C.text, textAlign: "center", margin: "0 0 22px", lineHeight: 1.3 }}>
              Signalez un problème pour nous aider à protéger la confiance sur Yelen
            </h2>

            <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "8px", backgroundColor: theme === "dark" ? "rgba(255,255,255,0.06)" : "#f2f2f7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: C.textMuted }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>
              </div>
              <p style={{ fontSize: "13.5px", color: C.textMuted, lineHeight: 1.6, margin: 0 }}>Documentez un fait précis et réel, survenu lors d&apos;un rendez-vous — jamais une supposition.</p>
            </div>
            <div style={{ display: "flex", gap: "12px", marginBottom: "22px" }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "8px", backgroundColor: theme === "dark" ? "rgba(255,255,255,0.06)" : "#f2f2f7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: C.textMuted }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
              </div>
              <p style={{ fontSize: "13.5px", color: C.textMuted, lineHeight: 1.6, margin: 0 }}>Ajoutez une capture d&apos;écran ou une photo pour appuyer votre signalement.</p>
            </div>

            <p style={{ fontSize: "12px", color: C.textFaint, lineHeight: 1.6, textAlign: "center", marginBottom: "20px" }}>
              Un signalement infondé ou abusif expose son auteur aux mêmes conséquences sur son propre compte.
            </p>

            <button
              onClick={() => setIntroOpen(false)}
              className="tap"
              style={{ width: "100%", backgroundColor: "#F5A623", border: "none", borderRadius: "14px", padding: "15px", color: "#080812", fontSize: "15px", fontWeight: 800, cursor: "pointer" }}
            >
              Continuer
            </button>
          </div>
        </div>
      )}

      {/* ── SHEET "CHOISIR UNE INSTITUTION" — quasi plein écran (92svh,
          référence YouTube) + recherche, retour Bryan 11/09/2026 :
          filtrage client-side sur la liste déjà chargée par
          fetchInstitutions() (pas de round-trip serveur par frappe). ── */}
      {institutionSheetOpen && (() => {
        const q = institutionSearch.trim().toLowerCase();
        const filtered = q ? institutions.filter(i => i.name.toLowerCase().includes(q)) : institutions;
        return (
          <div onClick={() => setInstitutionSheetOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 9600, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: "560px", height: "92svh", backgroundColor: C.pageBg, borderTopLeftRadius: "24px", borderTopRightRadius: "24px", display: "flex", flexDirection: "column", animation: "sheetUp 0.28s cubic-bezier(0.22,1,0.36,1)", overflow: "hidden" }}>
              <div style={{ flexShrink: 0, padding: "10px 20px 12px", borderBottom: `1px solid ${C.borderCard}` }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: "10px" }}>
                  <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: theme === "dark" ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)" }}/>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                  <span style={{ fontSize: "16px", fontWeight: 800, color: C.text }}>Choisir une institution</span>
                  <button onClick={() => setInstitutionSheetOpen(false)} aria-label="Fermer" className="tap" style={{ width: "28px", height: "28px", borderRadius: "50%", background: theme === "dark" ? "rgba(255,255,255,0.06)" : "#f2f2f7", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSubtle, cursor: "pointer" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: C.textFaint, display: "flex" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  </span>
                  {/* Pas d'autoFocus (retour Bryan 11/09/2026) — le clavier
                      qui s'ouvre en même temps que l'animation du sheet
                      casse le rendu initial sur iOS (écran qui semble
                      "tiré" vers le haut tant qu'on n'a pas scrollé
                      manuellement). L'utilisateur tape la barre quand il
                      veut chercher. */}
                  <input
                    value={institutionSearch}
                    onChange={e => setInstitutionSearch(e.target.value)}
                    placeholder="Rechercher une institution..."
                    style={{ ...inputStyle, paddingLeft: "38px" }}
                  />
                </div>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px calc(20px + env(safe-area-inset-bottom))" }}>
                {filtered.length === 0 ? (
                  <p style={{ textAlign: "center", color: C.textFaint, fontSize: "13px", padding: "40px 0" }}>Aucune institution ne correspond à « {institutionSearch} ».</p>
                ) : filtered.map(inst => (
                  <button
                    key={inst.id}
                    onClick={() => { setInstitutionId(inst.id); setInstitutionSheetOpen(false); }}
                    className="tap"
                    style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", textAlign: "left", padding: "12px 4px", background: "none", border: "none", borderBottom: `1px solid ${C.borderCard}`, cursor: "pointer" }}
                  >
                    <div style={{ width: "36px", height: "36px", borderRadius: "10px", overflow: "hidden", flexShrink: 0, backgroundColor: theme === "dark" ? "rgba(255,255,255,0.06)" : "#f2f2f7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {inst.logo ? <Image src={inst.logo} alt="" width={36} height={36} style={{ objectFit: "cover", width: "100%", height: "100%" }}/> : <span style={{ fontSize: "13px", fontWeight: 800, color: C.textSubtle }}>{inst.name.charAt(0).toUpperCase()}</span>}
                    </div>
                    <span style={{ fontSize: "14px", fontWeight: 600, color: institutionId === inst.id ? "#F5A623" : C.text, flex: 1 }}>{inst.name}</span>
                    {institutionId === inst.id && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── SHEET "CHOISIR UN RENDEZ-VOUS" — V2 progressive disclosure
          (retour Bryan 11/09/2026). N'ouvre que quand rdvsEligibles a déjà
          au moins une entrée (le cas 0 rendez-vous est traité en ligne,
          sans sheet, dans l'écran principal). ── */}
      {rdvSheetOpen && (
        <div onClick={() => setRdvSheetOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 9600, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: "560px", maxHeight: "80svh", overflowY: "auto", backgroundColor: C.pageBg, borderTopLeftRadius: "24px", borderTopRightRadius: "24px", padding: "10px 20px calc(20px + env(safe-area-inset-bottom))", animation: "sheetUp 0.28s cubic-bezier(0.22,1,0.36,1)" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "10px" }}>
              <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: theme === "dark" ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)" }}/>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
              <span style={{ fontSize: "16px", fontWeight: 800, color: C.text }}>Choisir un rendez-vous</span>
              <button onClick={() => setRdvSheetOpen(false)} aria-label="Fermer" className="tap" style={{ width: "28px", height: "28px", borderRadius: "50%", background: theme === "dark" ? "rgba(255,255,255,0.06)" : "#f2f2f7", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSubtle, cursor: "pointer", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div>
              {rdvsEligibles.map(r => (
                <button
                  key={r.id}
                  onClick={() => { setRdvId(r.id); setRdvSheetOpen(false); }}
                  className="tap"
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", width: "100%", textAlign: "left", padding: "13px 4px", background: "none", border: "none", borderBottom: `1px solid ${C.borderCard}`, cursor: "pointer" }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: "14px", fontWeight: 700, color: rdvId === r.id ? "#F5A623" : C.text }}>{formatDate(r.date_rdv)}</span>
                    <span style={{ display: "block", fontSize: "12.5px", color: C.textSubtle, marginTop: "2px" }}>{r.heure_rdv?.slice(0, 5)} · {institutions.find(i => i.id === institutionId)?.name}</span>
                    <span style={{ display: "block", fontSize: "12px", color: C.textFaint, marginTop: "1px" }}>{r.objet || "RDV général"}</span>
                  </span>
                  {rdvId === r.id && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── SHEET "MOTIF" — V2 progressive disclosure (retour Bryan
          11/09/2026), motifs sourcés de lib/signalementsConstants.ts (liste
          blanche partagée avec l'API), jamais reformulés localement. ── */}
      {motifSheetOpen && (
        <div onClick={() => setMotifSheetOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 9600, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: "560px", maxHeight: "80svh", overflowY: "auto", backgroundColor: C.pageBg, borderTopLeftRadius: "24px", borderTopRightRadius: "24px", padding: "10px 20px calc(20px + env(safe-area-inset-bottom))", animation: "sheetUp 0.28s cubic-bezier(0.22,1,0.36,1)" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "10px" }}>
              <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: theme === "dark" ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)" }}/>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px", marginBottom: "10px" }}>
              <span style={{ fontSize: "16px", fontWeight: 800, color: C.text, lineHeight: 1.3 }}>Pourquoi souhaitez-vous signaler ce rendez-vous ?</span>
              <button onClick={() => setMotifSheetOpen(false)} aria-label="Fermer" className="tap" style={{ width: "28px", height: "28px", borderRadius: "50%", background: theme === "dark" ? "rgba(255,255,255,0.06)" : "#f2f2f7", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSubtle, cursor: "pointer", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div>
              {MOTIFS_CITOYEN.map(m => (
                <button
                  key={m.value}
                  onClick={() => {
                    setMotif(m.value);
                    // "Autre" reste ouvert (retour Bryan 11/09/2026) — un
                    // texte libre est requis avant de pouvoir refermer le
                    // sheet, voir le champ révélé juste en dessous.
                    if (m.value !== "autre") { setMotifSheetOpen(false); }
                  }}
                  className="tap"
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", width: "100%", textAlign: "left", padding: "13px 4px", background: "none", border: "none", borderBottom: `1px solid ${C.borderCard}`, cursor: "pointer" }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: "14px", fontWeight: 700, color: motif === m.value ? "#F5A623" : C.text }}>{m.label}</span>
                    <span style={{ display: "block", fontSize: "12px", color: C.textSubtle, marginTop: "2px" }}>{m.desc}</span>
                  </span>
                  {motif === m.value && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>}
                </button>
              ))}
            </div>

            {/* Texte libre — révélé uniquement quand "Autre" est sélectionné
                (retour Bryan 11/09/2026). "Valider" ne referme le sheet que
                si un texte a été saisi. */}
            {motif === "autre" && (
              <div style={{ marginTop: "12px" }}>
                <label style={{ display: "block", fontSize: "11px", color: C.textSubtle, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px", fontWeight: 600 }}>Précisez votre motif *</label>
                <textarea
                  autoFocus
                  value={motifAutre}
                  onChange={e => setMotifAutre(e.target.value)}
                  rows={2}
                  placeholder="Décrivez en quelques mots le motif de votre signalement..."
                  style={{ width: "100%", backgroundColor: theme === "dark" ? "rgba(255,255,255,0.04)" : "#f9f9fb", border: `1px solid ${C.borderCard}`, borderRadius: "10px", padding: "12px 14px", color: C.text, fontSize: "14px", fontFamily: "inherit", resize: "none", lineHeight: "1.6", marginBottom: "12px" }}
                />
                <button
                  onClick={() => { if (motifAutre.trim()) { setMotifSheetOpen(false); } }}
                  disabled={!motifAutre.trim()}
                  className="tap"
                  style={{ width: "100%", backgroundColor: motifAutre.trim() ? "#F5A623" : (theme === "dark" ? "rgba(255,255,255,0.08)" : "#e5e5ea"), border: "none", borderRadius: "12px", padding: "13px", color: motifAutre.trim() ? "#1a1200" : C.textFaint, fontSize: "14px", fontWeight: 700, cursor: motifAutre.trim() ? "pointer" : "default" }}
                >
                  Valider
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SHEET "VÉRIFICATION AVANT ENVOI" — dernier écran du parcours V2
          (retour Bryan 11/09/2026) : récapitule les 4 champs, "Modifier"
          referme le sheet sans rien envoyer, "Envoyer le signalement"
          appelle le même handleSubmit qu'avant (métier inchangé). ── */}
      {reviewOpen && (() => {
        const instName = institutions.find(i => i.id === institutionId)?.name || "";
        const rdv = rdvsEligibles.find(r => r.id === rdvId);
        const motifLabel = motif === "autre" && motifAutre.trim() ? motifAutre.trim() : (MOTIFS_CITOYEN.find(m => m.value === motif)?.label || motif);
        const ligneLabel = { fontSize: "11px", color: C.textFaint, fontWeight: 700 as const, textTransform: "uppercase" as const, letterSpacing: "0.06em", margin: "0 0 4px" };
        const ligneValeur = { fontSize: "14px", color: C.text, fontWeight: 600 as const, margin: 0 };
        return (
          <div onClick={() => setReviewOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 9700, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: "560px", maxHeight: "92svh", overflowY: "auto", backgroundColor: C.cardBg, borderTopLeftRadius: "24px", borderTopRightRadius: "24px", padding: "10px 20px calc(20px + env(safe-area-inset-bottom))", animation: "sheetUp 0.28s cubic-bezier(0.22,1,0.36,1)" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}>
                <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: theme === "dark" ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)" }}/>
              </div>
              <h2 style={{ fontSize: "18px", fontWeight: 800, color: C.text, margin: "0 0 18px" }}>Vérifiez votre signalement</h2>

              <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "20px" }}>
                <div>
                  <p style={ligneLabel}>Institution</p>
                  <p style={ligneValeur}>{instName}</p>
                </div>
                <div>
                  <p style={ligneLabel}>Rendez-vous</p>
                  <p style={ligneValeur}>{rdv ? `${formatDate(rdv.date_rdv)} · ${rdv.heure_rdv?.slice(0, 5)}` : ""}</p>
                  {rdv?.objet && <p style={{ fontSize: "12px", color: C.textSubtle, margin: "2px 0 0" }}>{rdv.objet}</p>}
                </div>
                <div>
                  <p style={ligneLabel}>Motif</p>
                  <p style={ligneValeur}>{motifLabel}</p>
                </div>
                <div>
                  <p style={ligneLabel}>Description</p>
                  <p style={{ fontSize: "13px", color: C.textMuted, lineHeight: "1.6", margin: 0, backgroundColor: theme === "dark" ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", borderRadius: "8px", padding: "10px 12px", border: `1px solid ${C.borderSubtle}` }}>{description}</p>
                </div>
                {imagePreview && (
                  <div>
                    <p style={ligneLabel}>Pièce justificative</p>
                    {/* IMG-EXCEPTION: reason=aperçu blob local (URL.createObjectURL) avant envoi, non fetchable par l'optimiseur next/image | reviewed=2026-08-08 */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagePreview} alt="" style={{ height: "70px", borderRadius: "8px", objectFit: "cover", border: `1px solid ${C.borderCard}` }}/>
                  </div>
                )}
              </div>

              {error && (
                <div style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "10px", padding: "12px 16px", color: "#ef4444", fontSize: "13px", marginBottom: "14px" }}>
                  {error}
                </div>
              )}

              <button onClick={() => setReviewOpen(false)} className="tap" style={{ width: "100%", padding: "13px", borderRadius: "12px", border: `1px solid ${C.borderCard}`, background: "none", color: C.text, fontWeight: 700, fontSize: "14px", cursor: "pointer", marginBottom: "10px" }}>
                Modifier
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="tap"
                style={{ width: "100%", backgroundColor: loading ? (theme === "dark" ? "rgba(255,255,255,0.08)" : "#e5e5ea") : "#F5A623", border: "none", borderRadius: "12px", padding: "15px", color: loading ? C.textFaint : "#1a1200", fontSize: "15px", fontWeight: "700", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
              >
                {loading ? <><YelenLoader size={18}/> Envoi en cours…</> : "Envoyer le signalement"}
              </button>

              <p style={{ fontSize: "11px", color: C.textFaint, textAlign: "center", lineHeight: "1.6", marginTop: "14px" }}>
                En soumettant ce signalement, vous acceptez nos <Link href="/cgu" style={{ color: "#F5A623", textDecoration: "none" }}>CGU</Link> et confirmez l&apos;exactitude des informations fournies.
              </p>
            </div>
          </div>
        );
      })()}

      {/* ── DÉTAIL D'UN SIGNALEMENT — V2 (11/09/2026) : Rendez-vous
          concerné/Motif/Votre signalement/Pièces jointes/Suivi en sections
          séparées, plus de description en tête de fiche (retour Bryan :
          "le détail = contenu complet + suivi"). Même convention overlay
          que app/compte/activites/activites-client.tsx. ── */}
      {detailSig && (() => {
        const cfg = STATUT_CFG[detailSig.statut] || STATUT_CFG.nouveau;
        const motifLabel = MOTIFS_CITOYEN.find(m => m.value === detailSig.motif)?.label || detailSig.motif;
        const sectionLabel = { fontSize: "11px", color: C.textFaint, fontWeight: "700" as const, textTransform: "uppercase" as const, letterSpacing: "0.06em", margin: "0 0 6px" };
        return (
          <div onClick={() => setDetailSig(null)} style={{ position: "fixed", inset: 0, zIndex: 9000, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            <div onClick={e => e.stopPropagation()} style={{ backgroundColor: C.cardBg, borderTopLeftRadius: "24px", borderTopRightRadius: "24px", padding: "10px 24px calc(24px + env(safe-area-inset-bottom))", width: "100%", maxWidth: "560px", maxHeight: "88svh", overflowY: "auto", animation: "sheetUp 0.28s cubic-bezier(0.22,1,0.36,1)" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}>
                <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: theme === "dark" ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)" }}/>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "8px" }}>
                <div>
                  <p style={{ fontSize: "16px", fontWeight: "800", color: C.text, margin: "0 0 4px" }}>{detailSig.institution_name}</p>
                  <p style={{ fontSize: "13px", color: C.textSubtle, margin: 0 }}>{motifLabel}</p>
                </div>
                <button onClick={() => setDetailSig(null)} style={{ background: "none", border: "none", color: C.textSubtle, cursor: "pointer", padding: "4px", flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "18px" }}>
                <span style={{ fontSize: "12.5px", color: C.textSubtle }}>Statut :</span>
                <span style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color, fontSize: "11px", fontWeight: "700", padding: "4px 10px", borderRadius: "20px" }}>
                  {cfg.label}
                </span>
              </div>

              {detailSig.rdv_date && (
                <div style={{ marginBottom: "16px" }}>
                  <p style={sectionLabel}>Rendez-vous concerné</p>
                  <p style={{ fontSize: "13.5px", fontWeight: 600, color: C.text, margin: "0 0 2px" }}>{formatDate(detailSig.rdv_date)}{detailSig.rdv_heure ? ` · ${detailSig.rdv_heure.slice(0, 5)}` : ""}</p>
                  <p style={{ fontSize: "12.5px", color: C.textSubtle, margin: 0 }}>{detailSig.institution_name} · {detailSig.rdv_objet || "RDV général"}</p>
                </div>
              )}

              <div style={{ marginBottom: "16px" }}>
                <p style={sectionLabel}>Motif</p>
                <p style={{ fontSize: "13.5px", color: C.text, margin: 0 }}>{motifLabel}</p>
              </div>

              {detailSig.description && (
                <div style={{ marginBottom: "16px" }}>
                  <p style={sectionLabel}>Votre signalement</p>
                  <p style={{ fontSize: "13px", color: C.textMuted, lineHeight: "1.6", margin: 0, backgroundColor: theme === "dark" ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", borderRadius: "8px", padding: "10px 12px", border: `1px solid ${C.borderSubtle}`, whiteSpace: "pre-wrap" }}>{detailSig.description}</p>
                </div>
              )}

              {detailSig.preuve_url && (
                <div style={{ marginBottom: "16px" }}>
                  <p style={sectionLabel}>Pièces jointes</p>
                  <Image src={detailSig.preuve_url} width={360} height={160} onClick={() => window.open(detailSig.preuve_url!, "_blank")} style={{ width: "100%", height: "auto", borderRadius: "10px", objectFit: "cover", cursor: "pointer", border: `1px solid ${C.borderCard}` }} alt="preuve"/>
                </div>
              )}

              {/* Suivi — timeline chargée à l'ouverture (V2, 11/09/2026),
                  voir useEffect([detailSig]) plus haut. */}
              <div style={{ marginBottom: "8px" }}>
                <p style={sectionLabel}>Suivi</p>
                {loadingSuivi ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: C.textSubtle, fontSize: "12.5px", padding: "6px 0" }}>
                    <YelenLoader size={14}/> Chargement…
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {detailSuivi.map((ev, i) => (
                      <div key={i} style={{ display: "flex", gap: "10px", alignItems: "baseline" }}>
                        <span style={{ fontSize: "12px", color: C.textFaint, flexShrink: 0, minWidth: "78px" }}>{formatDate(ev.created_at)}</span>
                        <span style={{ fontSize: "13px", color: C.text, fontWeight: 600 }}>
                          {ev.type === "created" ? "Signalement envoyé" : (ev.statut ? (STATUT_LABEL_CITOYEN[ev.statut] || ev.statut) : "Mise à jour")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <p style={{ fontSize: "11px", color: C.textFaint, margin: "8px 0 0", display: "flex", alignItems: "center", gap: "5px" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                {formatDate(detailSig.created_at)} · #{detailSig.id.slice(0, 8).toUpperCase()}
              </p>
            </div>
          </div>
        );
      })()}

      {/* ── SHEET "SIGNALEMENT ENVOYÉ" — confirmation niveau Uber/Airbnb
          "What's next" (même principe que app/rdv/[id]/page.tsx::prochainesEtapes,
          demande explicite Bryan 11/09/2026), remplace l'ancien bandeau
          "Succès" discret + toast. Se ferme uniquement par action explicite
          (bouton), jamais un auto-hide — cohérent avec les autres sheets de
          cet écran. Aucune promesse de notification citoyen : vérifié dans
          app/api/citoyen/signalements/route.ts et lib/signalements.ts, seule
          l'institution est notifiée par changement de statut, jamais le
          citoyen — le suivi reste donc à consulter dans "Mes signalements". */}
      {success && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9800, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: "560px", maxHeight: "92svh", overflowY: "auto", backgroundColor: C.cardBg, borderTopLeftRadius: "24px", borderTopRightRadius: "24px", padding: "24px 24px calc(20px + env(safe-area-inset-bottom))", animation: "sheetUp 0.28s cubic-bezier(0.22,1,0.36,1)" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "18px" }}>
              <Image src="/illustrations/signalement-envoye.png" alt="" width={1672} height={941} style={{ width: "220px", maxWidth: "100%", height: "auto", display: "block" }}/>
            </div>

            <h2 style={{ fontSize: "19px", fontWeight: 800, color: C.text, textAlign: "center", margin: "0 0 6px" }}>Signalement envoyé</h2>
            {numeroPublic && (
              <p style={{ fontSize: "12.5px", color: C.textFaint, textAlign: "center", margin: "0 0 10px" }}>Référence {numeroPublic}</p>
            )}
            <p style={{ fontSize: "13.5px", color: C.textMuted, textAlign: "center", lineHeight: 1.6, margin: "0 0 22px" }}>
              Merci, votre signalement a bien été transmis pour examen.
            </p>

            <div style={{ border: `1px solid ${C.borderSubtle}`, borderRadius: "14px", padding: "16px 18px", marginBottom: "22px" }}>
              <p style={{ fontSize: "11px", fontWeight: 800, color: C.text, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 12px" }}>Que se passe-t-il maintenant ?</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {[
                  { icon: <><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>, texte: "Votre signalement est examiné sous 48h ouvrées." },
                  { icon: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></>, texte: `L'établissement concerné${(() => { const n = institutions.find(i => i.id === institutionId)?.name; return n ? ` (${n})` : ""; })()} est informé pour instruire le dossier.` },
                  { icon: <><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>, texte: "Suivez son avancement à tout moment dans l'onglet « Mes signalements »." },
                ].map((etape, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                    <span style={{ flexShrink: 0, marginTop: "1px", color: C.textSubtle }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{etape.icon}</svg>
                    </span>
                    <p style={{ fontSize: "12.5px", color: C.textSubtle, lineHeight: 1.6, margin: 0 }}>{etape.texte}</p>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => { setSuccess(false); setTab("historique"); }}
              className="tap"
              style={{ width: "100%", backgroundColor: "#F5A623", border: "none", borderRadius: "12px", padding: "14px", color: "#1a1200", fontSize: "15px", fontWeight: "700", cursor: "pointer", marginBottom: "10px" }}
            >
              Voir mes signalements
            </button>
            <button
              onClick={() => setSuccess(false)}
              className="tap"
              style={{ width: "100%", padding: "13px", borderRadius: "12px", border: `1px solid ${C.borderCard}`, background: "none", color: C.text, fontWeight: 700, fontSize: "14px", cursor: "pointer" }}
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Page export avec Suspense (requis pour useSearchParams) ──────────────────

export default function SignalementPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#080812" }}>
        <YelenLoader size={32}/>
      </div>
    }>
      <SignalementInner />
    </Suspense>
  );
}