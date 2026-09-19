"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader, CompteLoadingScreen } from "@/components/CompteEcranVide";
import { PullToRefresh } from "@/components/PullToRefresh";
import { deleteCitoyenAccount } from "@/app/profil/actions";
import { SuppressionCompteOverlay } from "@/components/SuppressionCompteOverlay";
import type { ChampsVisibles } from "@/lib/citoyenConfidentialite";

// Section définie au niveau module — jamais à l'intérieur du composant
// (piège React déjà rencontré sur l'écran Sécurité : un composant
// redéfini à chaque rendu perd le focus de ses champs à chaque frappe).
function Section({ titre, t1, children }: { titre: string; t1: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "28px" }}>
      <div style={{ color: t1, fontSize: "13px", fontWeight: 800, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "12px" }}>{titre}</div>
      {children}
    </section>
  );
}

const P = { pointerEvents: "none" as const };
const Ic = {
  Eye:    () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  Lock:   () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  Camera: () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  Bell:   () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  Mic:    () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>,
  Check:  () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Down:   () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Trash:  () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/></svg>,
};

function Switch({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button" onClick={onToggle} disabled={disabled} className="tap"
      style={{
        width: "44px", height: "26px", borderRadius: "13px", border: "none", cursor: disabled ? "default" : "pointer",
        background: on ? "#F5A623" : "rgba(142,142,147,0.35)", position: "relative", flexShrink: 0, opacity: disabled ? 0.5 : 1,
        transition: "background 0.2s",
      }}
    >
      <div style={{ position: "absolute", top: "2px", left: on ? "20px" : "2px", width: "22px", height: "22px", borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}/>
    </button>
  );
}

// Même convention que Section/Switch ci-dessus — était redéfini à
// l'intérieur de ConfidentialiteClient() (bug réel, corrigé lors de
// l'audit de consolidation), exactement le piège documenté en tête de
// fichier.
function Row({ titre, description, right, t1, t2 }: { titre: string; description: string; right: React.ReactNode; t1: string; t2: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px 0" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: t1, fontSize: "14px", fontWeight: 700, marginBottom: "2px" }}>{titre}</div>
        <div style={{ color: t2, fontSize: "12px", lineHeight: 1.4 }}>{description}</div>
      </div>
      <div style={{ flexShrink: 0, marginTop: "2px" }}>{right}</div>
    </div>
  );
}

type Statut = {
  cgu_acceptee_le: string | null;
  confidentialite_acceptee_le: string | null;
  champs_visibles: ChampsVisibles;
  profil_public: boolean;
  partage_historique_rdv: boolean;
  partage_historique_services: boolean;
  communications_yelen: boolean;
  communications_etablissements: boolean;
  personnalisation: boolean;
};

type EtatPermission = "granted" | "denied" | "prompt" | "indisponible";
const LABEL_PERMISSION: Record<EtatPermission, string> = {
  granted: "Autorisé", denied: "Refusé", prompt: "Non demandé", indisponible: "Non disponible sur ce navigateur",
};
const COULEUR_PERMISSION: Record<EtatPermission, string> = {
  granted: "#22c55e", denied: "#ef4444", prompt: "#8E8E93", indisponible: "#8E8E93",
};

function formatDate(iso: string | null): string {
  if (!iso) return "Non renseigné";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

const CHAMPS_LABELS: { key: keyof ChampsVisibles; titre: string; description: string }[] = [
  { key: "nom_complet", titre: "Nom complet", description: "Votre prénom et nom visibles par les établissements." },
  { key: "photo", titre: "Photo", description: "Votre photo de profil visible par les établissements." },
  { key: "profession", titre: "Profession", description: "Votre profession visible par les établissements." },
  { key: "adresse", titre: "Adresse", description: "Votre adresse visible par les établissements." },
  { key: "email", titre: "Email", description: "Votre adresse email visible par les établissements." },
  { key: "date_naissance", titre: "Date de naissance", description: "Votre date de naissance visible par les établissements." },
];

export function ConfidentialiteClient() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg   = isDark ? "#0A0A0F" : "#F2F2F7";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1   = isDark ? "#FFFFFF" : "#000000";
  const t2   = isDark ? "#8E8E93" : "#6C6C70";
  const t3   = isDark ? "#636366" : "#AEAEB2";
  const brd  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  const [userId, setUserId] = useState<string | null>(null);
  const [statut, setStatut] = useState<Statut | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const [visibiliteOuvert, setVisibiliteOuvert] = useState(false);
  const [permissions, setPermissions] = useState<Record<string, EtatPermission>>({
    geolocation: "indisponible", camera: "indisponible", microphone: "indisponible", notifications: "indisponible",
  });

  const [pinConfigure, setPinConfigure] = useState(false);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [suppOuvert, setSuppOuvert] = useState(false);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const charger = useCallback(async () => {
    const accessToken = await getAccessToken();
    if (!accessToken) { showToast("Session expirée, reconnectez-vous.", "error"); return; }
    const [statusRes, securiteRes] = await Promise.all([
      fetch("/api/citoyen/confidentialite/status", { headers: { Authorization: `Bearer ${accessToken}` } }),
      fetch("/api/citoyen/securite/status", { headers: { Authorization: `Bearer ${accessToken}` } }),
    ]);
    const statusJson = await statusRes.json().catch(() => null);
    if (!statusRes.ok || !statusJson?.success) { showToast(statusJson?.error ?? "Impossible de charger vos préférences.", "error"); return; }
    setStatut(statusJson);
    const securiteJson = await securiteRes.json().catch(() => null);
    if (securiteRes.ok && securiteJson?.success) {
      setPinConfigure(!!securiteJson.pin_configured);
      setTotpEnabled(!!securiteJson.totp_enabled);
      setPhone(securiteJson.phone ?? null);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!id) { router.replace("/inscription"); return; }
    setUserId(id);
    void (async () => { setLoading(true); await charger(); setLoading(false); })();
  }, [router, charger]);

  useEffect(() => {
    // Lecture seule — le web ne permet pas d'activer/désactiver une
    // permission depuis l'app, seulement de lire l'état actuel et
    // rediriger vers les réglages du navigateur. Safari ne supporte pas
    // toujours la requête pour caméra/microphone : on retombe sur
    // "indisponible" plutôt que de planter.
    async function lire(name: string): Promise<EtatPermission> {
      try {
        if (!navigator.permissions?.query) return "indisponible";
        // "camera"/"microphone" ne sont pas dans le type PermissionName
        // standard de TypeScript (extension Chrome/Chromium), d'où le cast.
        const status = await navigator.permissions.query({ name: name as PermissionName });
        return status.state as EtatPermission;
      } catch { return "indisponible"; }
    }
    void (async () => {
      const [geolocation, camera, microphone] = await Promise.all([lire("geolocation"), lire("camera"), lire("microphone")]);
      const notifications: EtatPermission =
        typeof Notification === "undefined" ? "indisponible" :
        Notification.permission === "granted" ? "granted" :
        Notification.permission === "denied" ? "denied" : "prompt";
      setPermissions({ geolocation, camera, microphone, notifications });
    })();
  }, []);

  async function majVisibilite(patch: Partial<ChampsVisibles & { profil_public: boolean }>) {
    if (!statut) return;
    const accessToken = await getAccessToken();
    if (!accessToken) { showToast("Session expirée, reconnectez-vous.", "error"); return; }
    const champsVisibles = { ...statut.champs_visibles, ...patch };
    delete (champsVisibles as Record<string, unknown>).profil_public;
    const profilPublic = "profil_public" in patch ? patch.profil_public : statut.profil_public;

    setStatut({ ...statut, champs_visibles: { ...statut.champs_visibles, ...patch }, profil_public: profilPublic ?? statut.profil_public });
    const res = await fetch("/api/citoyen/confidentialite/visibilite", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, champsVisibles, profilPublic }),
    });
    if (!res.ok) { showToast("Impossible d'enregistrer ce réglage.", "error"); await charger(); }
  }

  async function majPartage(patch: { partageHistoriqueRdv?: boolean; partageHistoriqueServices?: boolean }) {
    if (!statut) return;
    const accessToken = await getAccessToken();
    if (!accessToken) { showToast("Session expirée, reconnectez-vous.", "error"); return; }
    setStatut({
      ...statut,
      partage_historique_rdv: patch.partageHistoriqueRdv ?? statut.partage_historique_rdv,
      partage_historique_services: patch.partageHistoriqueServices ?? statut.partage_historique_services,
    });
    const res = await fetch("/api/citoyen/confidentialite/partage", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, ...patch }),
    });
    if (!res.ok) { showToast("Impossible d'enregistrer ce réglage.", "error"); await charger(); }
  }

  async function majCommunication(patch: { communicationsYelen?: boolean; communicationsEtablissements?: boolean; personnalisation?: boolean }) {
    if (!statut) return;
    const accessToken = await getAccessToken();
    if (!accessToken) { showToast("Session expirée, reconnectez-vous.", "error"); return; }
    setStatut({
      ...statut,
      communications_yelen: patch.communicationsYelen ?? statut.communications_yelen,
      communications_etablissements: patch.communicationsEtablissements ?? statut.communications_etablissements,
      personnalisation: patch.personnalisation ?? statut.personnalisation,
    });
    const res = await fetch("/api/citoyen/confidentialite/communication", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, ...patch }),
    });
    if (!res.ok) { showToast("Impossible d'enregistrer ce réglage.", "error"); await charger(); }
  }

  async function accepterConsentement(type: "cgu" | "confidentialite") {
    setBusy(`consentement-${type}`);
    const accessToken = await getAccessToken();
    if (!accessToken) { showToast("Session expirée, reconnectez-vous.", "error"); setBusy(null); return; }
    const res = await fetch("/api/citoyen/confidentialite/consentement", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, type }),
    });
    setBusy(null);
    if (!res.ok) { showToast("Impossible d'enregistrer votre consentement.", "error"); return; }
    showToast("Consentement enregistré.");
    await charger();
  }

  async function handleEnvoyerFeedback(raison: string | null, detail: string) {
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    await fetch("/api/citoyen/confidentialite/suppression-feedback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, raison, detail }),
    }).catch(() => {});
  }

  async function handleEnvoyerOtpSuppression(): Promise<{ ok: true } | { ok: false; error: string }> {
    const accessToken = await getAccessToken();
    if (!accessToken) return { ok: false, error: "Session expirée, reconnectez-vous." };
    const res = await fetch("/api/citoyen/confidentialite/suppression/otp-envoyer", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) return { ok: false, error: json?.error ?? "Envoi du code impossible." };
    return { ok: true };
  }

  // Vérifie l'identité avant d'autoriser l'écran de confirmation finale :
  // code SMS toujours requis, + PIN et/ou TOTP si le citoyen les a activés
  // (retour Bryan 12/09/2026) — aucune suppression n'a lieu ici.
  async function handleVerifierIdentite(otp: string, pin: string, totp: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const accessToken = await getAccessToken();
    if (!accessToken) return { ok: false, error: "Session expirée, reconnectez-vous." };

    const otpRes = await fetch("/api/citoyen/confidentialite/suppression/otp-verifier", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, code: otp }),
    });
    const otpJson = await otpRes.json().catch(() => null);
    if (!otpRes.ok || !otpJson?.success) return { ok: false, error: otpJson?.error ?? "Code incorrect." };

    if (pinConfigure) {
      const pinRes = await fetch("/api/citoyen/securite/pin/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, pin }),
      });
      const pinJson = await pinRes.json().catch(() => null);
      if (!pinRes.ok || !pinJson?.success) return { ok: false, error: pinJson?.error ?? "Code PIN incorrect." };
    }

    if (totpEnabled) {
      const totpRes = await fetch("/api/citoyen/securite/totp/verify-code", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, code: totp }),
      });
      const totpJson = await totpRes.json().catch(() => null);
      if (!totpRes.ok || !totpJson?.success) return { ok: false, error: totpJson?.error ?? "Code de double authentification incorrect." };
    }

    return { ok: true };
  }

  async function handleConfirmerSuppression(): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!userId) return { ok: false, error: "Session expirée, reconnectez-vous." };
    const accessToken = await getAccessToken();
    if (!accessToken) return { ok: false, error: "Session expirée, reconnectez-vous." };

    const result = await deleteCitoyenAccount(userId, accessToken);
    if (!result.ok) return { ok: false, error: result.error };
    await supabase.auth.signOut();
    try { localStorage.removeItem(YELEN224_USER_ID_KEY); } catch {}
    router.replace("/");
    return { ok: true };
  }

  const btnPrimary: React.CSSProperties = {
    background: "#F5A623", color: "#080812", fontWeight: 800, fontSize: "13.5px",
    padding: "10px 16px", borderRadius: "12px", border: "none", cursor: "pointer",
  };
  const btnGhost: React.CSSProperties = {
    background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", color: t1, fontWeight: 700, fontSize: "13px",
    padding: "10px 16px", borderRadius: "12px", border: `1px solid ${brd}`, cursor: "pointer",
  };
  if (loading) {
    return <CompteLoadingScreen titre="Confidentialité"/>;
  }

  const profilOuvert = !!statut && (statut.champs_visibles.adresse || statut.champs_visibles.email || statut.champs_visibles.date_naissance);

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`.tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}.tap:active{opacity:0.65;transform:scale(0.97)}@keyframes slideUp{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}`}</style>
      <CompteHeader titre="Confidentialité"/>
      <PullToRefresh onRefresh={charger} isDark={isDark}>
      <main style={{ padding: "16px 16px 40px" }}>
        <div style={{ padding: "4px 4px 20px" }}>
          <p style={{ color: t2, fontSize: "13.5px", margin: 0, lineHeight: 1.5 }}>Choisissez quelles informations vous souhaitez partager et gardez le contrôle de vos données.</p>
        </div>

        {statut && (
          <>
            {/* Résumé confidentialité */}
            <div style={{ backgroundColor: card, border: `1px solid ${profilOuvert ? "rgba(245,166,35,0.3)" : "rgba(34,197,94,0.25)"}`, borderRadius: "18px", padding: "20px", marginBottom: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <div style={{ color: profilOuvert ? "#F5A623" : "#22c55e" }}><Ic.Lock/></div>
                <div style={{ color: t1, fontSize: "13px", fontWeight: 700 }}>Confidentialité</div>
              </div>
              <div style={{ color: profilOuvert ? "#F5A623" : "#22c55e", fontSize: "19px", fontWeight: 800, marginBottom: "8px" }}>
                {profilOuvert ? "À vérifier" : "Très bien protégée"}
              </div>
              <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.5 }}>
                {profilOuvert
                  ? "Votre profil est actuellement visible par davantage d'établissements. Vérifiez vos préférences."
                  : "Vous contrôlez actuellement toutes les informations partagées avec les établissements et les services Yelen."}
              </div>
            </div>

            {/* Visibilité */}
            <Section titre="Visibilité" t1={t1}>
              <div style={{ backgroundColor: card, borderRadius: "16px", padding: "16px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                  <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "rgba(245,166,35,0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#F5A623", flexShrink: 0 }}><Ic.Eye/></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: t1, fontSize: "15px", fontWeight: 700, marginBottom: "3px" }}>Informations personnelles</div>
                    <div style={{ color: t2, fontSize: "12.5px" }}>Choisissez quelles informations les établissements peuvent consulter.</div>
                  </div>
                  <button className="tap" style={{ ...btnGhost, transform: visibiliteOuvert ? "rotate(180deg)" : "none", padding: "8px" }} onClick={() => setVisibiliteOuvert(!visibiliteOuvert)}>
                    <Ic.Down/>
                  </button>
                </div>

                {visibiliteOuvert && (
                  <div style={{ marginTop: "8px", borderTop: `1px solid ${brd}` }}>
                    {CHAMPS_LABELS.map((c) => (
                      <div key={c.key} style={{ borderBottom: `1px solid ${brd}` }}>
                        <Row
                          t1={t1} t2={t2}
                          titre={c.titre} description={c.description}
                          right={<Switch on={statut.champs_visibles[c.key]} onToggle={() => majVisibilite({ [c.key]: !statut.champs_visibles[c.key] } as Partial<ChampsVisibles>)}/>}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ backgroundColor: card, borderRadius: "16px", padding: "16px", marginTop: "12px" }}>
                <Row
                  t1={t1} t2={t2}
                  titre="Profil public"
                  description="Autoriser les établissements à consulter votre profil public avant une prise de rendez-vous."
                  right={<Switch on={statut.profil_public} onToggle={() => majVisibilite({ profil_public: !statut.profil_public })}/>}
                />
              </div>
            </Section>

            {/* Partage des données */}
            <Section titre="Partage des données" t1={t1}>
              <div style={{ backgroundColor: card, borderRadius: "16px", padding: "16px" }}>
                <Row
                  t1={t1} t2={t2}
                  titre="Historique des rendez-vous"
                  description="Autoriser un établissement à consulter vos anciens rendez-vous réalisés avec lui."
                  right={<Switch on={statut.partage_historique_rdv} onToggle={() => majPartage({ partageHistoriqueRdv: !statut.partage_historique_rdv })}/>}
                />
                <div style={{ borderTop: `1px solid ${brd}` }}>
                  <Row
                    t1={t1} t2={t2}
                    titre="Historique des services"
                    description="Partager l'historique des services déjà effectués dans le même établissement."
                    right={<Switch on={statut.partage_historique_services} onToggle={() => majPartage({ partageHistoriqueServices: !statut.partage_historique_services })}/>}
                  />
                </div>
                <div style={{ borderTop: `1px solid ${brd}` }}>
                  <Row
                    t1={t1} t2={t2}
                    titre="Informations de réservation"
                    description="Partager uniquement les informations nécessaires au traitement de votre rendez-vous. Toujours activé — indispensable au fonctionnement de Yelen."
                    right={<Switch on={true} onToggle={() => {}} disabled/>}
                  />
                </div>
              </div>
            </Section>

            {/* Autorisations */}
            <Section titre="Autorisations" t1={t1}>
              <div style={{ backgroundColor: card, borderRadius: "16px", padding: "16px" }}>
                {[
                  { icon: <Ic.Lock/>, titre: "Localisation", description: "Utilisée uniquement lorsque vous recherchez des établissements proches.", etat: permissions.geolocation },
                  { icon: <Ic.Camera/>, titre: "Caméra", description: "Utilisée pour scanner les QR codes.", etat: permissions.camera },
                  { icon: <Ic.Bell/>, titre: "Notifications", description: "Recevoir les rappels et informations importantes.", etat: permissions.notifications },
                  { icon: <Ic.Mic/>, titre: "Microphone", description: "Utilisé uniquement lorsque vous enregistrez un message vocal.", etat: permissions.microphone },
                ].map((p, i) => (
                  <div key={p.titre} style={{ borderTop: i === 0 ? "none" : `1px solid ${brd}` }}>
                    <Row
                      t1={t1} t2={t2}
                      titre={p.titre} description={p.description}
                      right={<span style={{ color: COULEUR_PERMISSION[p.etat], fontSize: "11.5px", fontWeight: 800 }}>{LABEL_PERMISSION[p.etat]}</span>}
                    />
                  </div>
                ))}
                <div style={{ borderTop: `1px solid ${brd}` }}>
                  <Row
                    t1={t1} t2={t2}
                    titre="Photos"
                    description="Ajouter une photo de profil ou transmettre un document. Aucune autorisation supplémentaire requise — le sélecteur de fichier de votre navigateur s'en charge."
                    right={<span style={{ color: t3, fontSize: "11.5px", fontWeight: 700 }}>—</span>}
                  />
                </div>
                <div style={{ color: t3, fontSize: "11px", marginTop: "10px", lineHeight: 1.4 }}>
                  Ces réglages se gèrent depuis les paramètres de votre navigateur ou de votre appareil — Yelen ne peut pas les modifier directement.
                </div>
              </div>
            </Section>

            {/* Consentements */}
            <Section titre="Consentements" t1={t1}>
              <div style={{ backgroundColor: card, borderRadius: "16px", padding: "16px" }}>
                <Row
                  t1={t1} t2={t2}
                  titre="Conditions d'utilisation"
                  description={statut.cgu_acceptee_le ? `Acceptées — ${formatDate(statut.cgu_acceptee_le)}` : "Non acceptées"}
                  right={statut.cgu_acceptee_le
                    ? <span style={{ color: "#22c55e" }}><Ic.Check/></span>
                    : <button disabled={busy === "consentement-cgu"} className="tap" style={btnPrimary} onClick={() => accepterConsentement("cgu")}>{busy === "consentement-cgu" ? "Enregistrement…" : "Accepter"}</button>}
                />
                <div style={{ borderTop: `1px solid ${brd}` }}>
                  <Row
                    t1={t1} t2={t2}
                    titre="Politique de confidentialité"
                    description={statut.confidentialite_acceptee_le ? `Acceptée — ${formatDate(statut.confidentialite_acceptee_le)}` : "Non acceptée"}
                    right={statut.confidentialite_acceptee_le
                      ? <span style={{ color: "#22c55e" }}><Ic.Check/></span>
                      : <button disabled={busy === "consentement-confidentialite"} className="tap" style={btnPrimary} onClick={() => accepterConsentement("confidentialite")}>{busy === "consentement-confidentialite" ? "Enregistrement…" : "Accepter"}</button>}
                  />
                </div>
                <div style={{ display: "flex", gap: "14px", marginTop: "10px", fontSize: "12px" }}>
                  <Link href="/cgu" style={{ color: "#F5A623", textDecoration: "none", fontWeight: 700 }}>Lire les CGU</Link>
                  <Link href="/confidentialite" style={{ color: "#F5A623", textDecoration: "none", fontWeight: 700 }}>Lire la politique</Link>
                </div>
              </div>

              <div style={{ backgroundColor: card, borderRadius: "16px", padding: "16px", marginTop: "12px" }}>
                <Row
                  t1={t1} t2={t2}
                  titre="Communications Yelen"
                  description="Recevoir les nouveautés Yelen."
                  right={<Switch on={statut.communications_yelen} onToggle={() => majCommunication({ communicationsYelen: !statut.communications_yelen })}/>}
                />
                <div style={{ borderTop: `1px solid ${brd}` }}>
                  <Row
                    t1={t1} t2={t2}
                    titre="Communications établissements"
                    description="Recevoir les annonces publiées par les établissements que vous suivez."
                    right={<Switch on={statut.communications_etablissements} onToggle={() => majCommunication({ communicationsEtablissements: !statut.communications_etablissements })}/>}
                  />
                </div>
                <div style={{ borderTop: `1px solid ${brd}` }}>
                  <Row
                    t1={t1} t2={t2}
                    titre="Personnalisation"
                    description="Recevoir des recommandations adaptées à votre activité."
                    right={<Switch on={statut.personnalisation} onToggle={() => majCommunication({ personnalisation: !statut.personnalisation })}/>}
                  />
                </div>
              </div>
            </Section>

            {/* Mes données */}
            <Section titre="Mes données" t1={t1}>
              <div style={{ backgroundColor: card, borderRadius: "16px", padding: "16px", marginBottom: "12px" }}>
                <Row
                  t1={t1} t2={t2}
                  titre="Télécharger mes données"
                  description="Disponible depuis Paramètres → Télécharger mes données."
                  right={<Link href="/compte/mes-donnees" className="tap" style={{ color: "#F5A623", fontSize: "13px", fontWeight: 700, textDecoration: "none" }}>Ouvrir</Link>}
                />
              </div>

              <div style={{ backgroundColor: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "16px", padding: "16px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                  <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "rgba(239,68,68,0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444", flexShrink: 0 }}><Ic.Trash/></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#ef4444", fontSize: "15px", fontWeight: 700, marginBottom: "3px" }}>Supprimer définitivement mes données</div>
                    <div style={{ color: t2, fontSize: "12.5px" }}>Supprimer définitivement votre compte et toutes les données associées.</div>
                  </div>
                  <button className="tap" style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444", fontWeight: 800, fontSize: "13px", padding: "10px 14px", borderRadius: "12px", border: "1px solid rgba(239,68,68,0.3)", cursor: "pointer" }} onClick={() => setSuppOuvert(true)}>
                    Supprimer
                  </button>
                </div>
              </div>
            </Section>
          </>
        )}
      </main>
      </PullToRefresh>

      {/* Parcours de suppression plein écran en 3 temps (retour Bryan
          12/09/2026) — feedback préalable, vérification d'identité
          (code SMS toujours + PIN/2FA si activés), puis confirmation
          finale. Remplace l'ancienne modale centrée unique. */}
      {suppOuvert && (
        <SuppressionCompteOverlay
          bg={bg} card={card} t1={t1} t2={t2} brd={brd} isDark={isDark}
          pinConfigure={pinConfigure} totpEnabled={totpEnabled} phone={phone}
          onClose={() => setSuppOuvert(false)}
          onEnvoyerFeedback={handleEnvoyerFeedback}
          onEnvoyerOtp={handleEnvoyerOtpSuppression}
          onVerifierIdentite={handleVerifierIdentite}
          onConfirmer={handleConfirmerSuppression}
        />
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
