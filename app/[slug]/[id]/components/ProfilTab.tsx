"use client";

// Onglet "Administration & accès" — identité et accès administratifs de CE
// membre connecté (nom, rôle réel, PIN, 2FA, activité de compte),
// accessible aux 5 rôles (chacun voit SES propres informations, pas celles
// des autres — contraste avec "Équipe" qui liste tout le monde mais reste
// réservé à equipe.read_full). Actions de gestion (révoquer une clé,
// déconnecter un appareil, changer email/téléphone de récupération)
// restent exclusives à "Sécurité du compte" (parametres-securite, admin
// uniquement) — un seul point d'entrée pour AGIR. Depuis la refonte
// desktop du 16/09/2026, un aperçu lecture-seule "Appareils & sessions"
// (admin uniquement, données institution-wide réelles) est affiché ici
// pour éviter un aller-retour systématique, avec un lien "Voir tous les
// appareils" vers l'écran complet pour la gestion. La 2FA TOTP reste un
// réglage personnel réel de CE membre (institution_membres.totp_enabled),
// exposée ici directement pour les 4 rôles qui n'ont pas accès à
// parametres-securite (TotpSection.tsx, partagée avec
// SecuriteCompteTab.tsx). Desktop ≥1024px : grille 2 colonnes pour
// "Accès à ce compte", même principe que .dispo-layout/.finance-groups.
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ROLE_LABELS, ROLE_DESCRIPTIONS, isMembreRole, type MembreRole } from "@/lib/institutionPermissions";
import { YelenLoader } from "@/components/YelenLoader";
import { TotpSection } from "./TotpSection";
import { PasskeySection } from "./PasskeySection";

type Moi = {
  id: string;
  identifiant: string;
  prenom: string;
  nom: string;
  role: MembreRole;
  actif: boolean;
  compte_principal: boolean;
  doit_changer_pin: boolean;
  locked_until: string | null;
  derniere_connexion: string | null;
  fonction: string | null;
  created_at: string;
};

type JournalEntree = { id: string; action: string; navigateur: string | null; os: string | null; created_at: string };

// Aperçu lecture-seule des appareils mémorisés (GET
// /api/institution/security-status, déjà scopée admin-only côté serveur —
// renvoie remember_devices: null pour les 4 autres rôles, jamais appelée
// pour eux ici). Pas de webauthn_credentials (clés d'accès) dans cet
// aperçu : leur gestion (ajout/révocation) reste exclusive à "Sécurité du
// compte", cet écran ne montre que les sessions "appareil mémorisé".
type RememberDevicePreview = { id: string; user_agent: string | null; created_at: string; is_current_device: boolean };

// Actions réellement émises par enregistrerAction() qui concernent le
// compte lui-même (catégories "authentification" et "equipe", voir
// lib/journalTaxonomie.ts) — pas de libellé fabriqué pour une action qui
// n'apparaîtra jamais dans ce filtre.
const ACTIVITE_LABELS: Record<string, string> = {
  connexion: "Connexion",
  membre_cree: "Compte créé",
  membre_modifie: "Compte modifié",
  membre_supprime: "Compte supprimé",
  membre_acces_refuse: "Accès refusé",
  pin_change_personnel: "PIN modifié",
  reauth_reussie: "Identité confirmée",
  reauth_echec: "Échec de confirmation d'identité",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// Même logique que SecuriteCompteTab.tsx::formatUserAgent — dupliquée à
// l'identique plutôt qu'extraite en partagé pour ce petit aperçu (pas de
// fichier commun pour une fonction de 3 lignes).
function formatUserAgent(ua: string | null): string {
  if (!ua) return "Appareil inconnu";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Macintosh/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : "Appareil";
  const browser = /Edg/.test(ua) ? "Edge" : /Chrome/.test(ua) ? "Chrome" : /Firefox/.test(ua) ? "Firefox" : /Safari/.test(ua) ? "Safari" : "Navigateur";
  return `${browser} sur ${os}`;
}

function SectionTitle({ C, label }: { C: ThemeTokens; label: string }) {
  return <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "8px", paddingLeft: "4px" }}>{label}</div>;
}

export function ProfilTab({ onToast, onNavigate }: { onToast: (msg: string, color?: string) => void; onNavigate?: (tab: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [loading, setLoading] = useState(true);
  const [moi, setMoi] = useState<Moi | null>(null);
  const [activite, setActivite] = useState<JournalEntree[] | null>(null);
  const [showChangerPin, setShowChangerPin] = useState(false);
  const [nouveauPin, setNouveauPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [appareils, setAppareils] = useState<RememberDevicePreview[] | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/institution/membres");
      const j = await res.json().catch(() => null);
      if (res.ok && isMembreRole(j?.role) && j?.moi) setMoi(j.moi);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!moi) return;
    (async () => {
      const [auRes, eqRes] = await Promise.all([
        fetch(`/api/institution/journal?membre_id=${moi.id}&categorie=authentification&limit=3`),
        fetch(`/api/institution/journal?membre_id=${moi.id}&categorie=equipe&limit=5`),
      ]);
      const [auData, eqData] = await Promise.all([auRes.json().catch(() => null), eqRes.json().catch(() => null)]);
      const entrees: JournalEntree[] = [...(auRes.ok ? auData?.entrees ?? [] : []), ...(eqRes.ok ? eqData?.entrees ?? [] : [])]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5);
      setActivite(entrees);
    })();
  }, [moi]);

  useEffect(() => {
    if (!moi || moi.role !== "admin") return;
    (async () => {
      const res = await fetch("/api/institution/security-status");
      const j = await res.json().catch(() => null);
      setAppareils(res.ok ? (j?.remember_devices ?? []) : []);
    })();
  }, [moi]);

  async function changerPin() {
    if (!moi || !/^\d{6}$/.test(nouveauPin)) return;
    setSaving(true);
    const res = await fetch("/api/institution/membres", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: moi.id, pin: nouveauPin }),
    });
    setSaving(false);
    if (!res.ok) { onToast("Erreur lors du changement de PIN", C.red); return; }
    setShowChangerPin(false); setNouveauPin("");
    onToast("PIN mis à jour", C.green);
  }

  if (loading || !moi) {
    return (
      <div style={{ padding: "48px 16px", display: "flex", justifyContent: "center" }}>
        <YelenLoader size={28}/>
      </div>
    );
  }

  // Comparaison au temps réel, volontairement réévaluée à chaque rendu (le
  // statut doit basculer à false une fois l'échéance passée) — impur par
  // nature, aucune restructuration sans ajouter un minuteur (hors périmètre
  // du gel produit en cours).
  // eslint-disable-next-line react-hooks/purity
  const verrouille = !!moi.locked_until && new Date(moi.locked_until).getTime() > Date.now();

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      {/* Desktop ≥1024px : "Accès à ce compte" passe en 2 colonnes
          (PIN | Sécurité avancée, ou PIN | 2FA+Passkeys pour les 4 rôles
          non-admin) — même principe que .dispo-layout (DisponibilitesTab)
          et FINANCE_GROUPS (layout.tsx), pas de largeur imposée sur toute
          la page (.yelen-page du parent gère déjà le max-width 1280px). */}
      <style>{`
        @media(min-width:1024px){
          .profil-acces-grid{grid-template-columns:1fr 1fr!important}
        }
      `}</style>

      <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "800", letterSpacing: "-0.5px", marginBottom: "6px" }}>Administration & accès</h1>
      <p style={{ color: C.t2, fontSize: "13px", marginBottom: "18px", maxWidth: "620px" }}>Votre identité administrative, votre méthode d&apos;accès et l&apos;activité de ce compte.</p>

      {/* ── IDENTITÉ ── */}
      <Card tokens={toCardTokens(C)} padding="18px" style={{ marginBottom: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "12px" }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: `linear-gradient(135deg, ${C.gold}30, ${C.gold}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: "800", color: C.gold, flexShrink: 0 }}>
            {(moi.prenom[0] ?? "").toUpperCase()}{(moi.nom[0] ?? "").toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: C.t1, fontSize: "16px", fontWeight: "800" }}>{moi.prenom} {moi.nom}</div>
            <div style={{ color: C.t3, fontSize: "12px", marginTop: "2px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              <span>{ROLE_LABELS[moi.role]}</span>
              {moi.compte_principal && (
                <>
                  <span style={{ color: C.border2 }}>·</span>
                  <span>Compte principal</span>
                </>
              )}
              {verrouille && <span style={{ backgroundColor: `${C.red}15`, color: C.red, fontSize: "9px", fontWeight: "800", padding: "2px 6px", borderRadius: "8px" }}>Verrouillé</span>}
            </div>
          </div>
        </div>
        <div style={{ color: C.t3, fontSize: "11.5px", lineHeight: 1.5, maxWidth: "620px" }}>{ROLE_DESCRIPTIONS[moi.role]}</div>
        <div style={{ display: "flex", justifyContent: "flex-start", gap: "48px", marginTop: "12px", paddingTop: "12px", borderTop: `1px solid ${C.border}`, fontSize: "11px" }}>
          <div>
            <div style={{ color: C.t3 }}>Identifiant</div>
            <div style={{ color: C.t1, fontWeight: "700", marginTop: "2px" }}>{moi.identifiant}</div>
          </div>
          <div>
            <div style={{ color: C.t3 }}>Dernière connexion</div>
            <div style={{ color: C.t1, fontWeight: "700", marginTop: "2px" }}>{moi.derniere_connexion ? timeAgo(moi.derniere_connexion) : "—"}</div>
          </div>
        </div>
      </Card>

      {/* ── ACCÈS À CE COMPTE ── */}
      <SectionTitle C={C} label="Accès à ce compte"/>
      <div className="profil-acces-grid" style={{ display: "grid", gridTemplateColumns: "1fr", gap: "14px", marginBottom: "14px", alignItems: "start" }}>
        {showChangerPin ? (
          <Card tokens={toCardTokens(C)} padding="16px">
            <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: "800", marginBottom: "10px" }}>Nouveau PIN à 6 chiffres</div>
            <input value={nouveauPin} onChange={e => setNouveauPin(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={6} placeholder="6 chiffres" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "10px", fontSize: "15px", color: C.t1, textAlign: "center", letterSpacing: "3px", marginBottom: "12px" }}/>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={() => { setShowChangerPin(false); setNouveauPin(""); }}>Annuler</Button>
              <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" disabled={!/^\d{6}$/.test(nouveauPin)} loading={saving} onClick={changerPin}>Valider</Button>
            </div>
          </Card>
        ) : (
          <Card tokens={toCardTokens(C)} padding="16px" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: "700" }}>PIN de connexion</div>
              <div style={{ color: C.t3, fontSize: "11px", marginTop: "2px" }}>Confirme votre identité pour accéder à ce compte</div>
            </div>
            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" style={{ color: C.gold, border: `1px solid ${C.gold}30`, flexShrink: 0 }} onClick={() => setShowChangerPin(true)}>Modifier</Button>
          </Card>
        )}

        {/* Admin : lien vers "Sécurité du compte" (un seul point d'entrée
            pour AGIR — révoquer une clé, changer la récupération, etc.).
            Les 4 autres rôles n'y ont pas accès (TAB_MATRIX) mais la 2FA
            TOTP et les passkeys SONT des réglages PERSONNELS réels de CE
            membre (institution_membres.totp_enabled,
            institution_webauthn_credentials.membre_id) — exposés ici
            directement, alternative à leur PIN pour se connecter. */}
        {moi.role === "admin" ? (
          <Card tokens={toCardTokens(C)} padding="16px" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: "700" }}>Sécurité avancée</div>
              <div style={{ color: C.t3, fontSize: "11px", marginTop: "2px" }}>Double authentification, clés d&apos;accès et appareils connectés</div>
            </div>
            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" style={{ flexShrink: 0 }} onClick={() => onNavigate?.("parametres-securite")}>Ouvrir</Button>
          </Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <Card tokens={toCardTokens(C)} padding="16px">
              <TotpSection onToast={onToast}/>
            </Card>
            <Card tokens={toCardTokens(C)} padding="16px">
              <PasskeySection onToast={onToast}/>
            </Card>
          </div>
        )}
      </div>

      {/* ── APPAREILS & SESSIONS — aperçu lecture-seule, admin uniquement
          (seul rôle avec des données institution-wide, voir en-tête de
          fichier). Gestion réelle (déconnecter un appareil) reste
          exclusive à "Sécurité du compte". ── */}
      {moi.role === "admin" && (
        <>
          <SectionTitle C={C} label="Appareils & sessions"/>
          <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
            {appareils === null ? (
              <YelenLoader size={16}/>
            ) : appareils.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "10px" }}>
                {[...appareils].sort((a, b) => (b.is_current_device ? 1 : 0) - (a.is_current_device ? 1 : 0) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 3).map(dev => (
                  <div key={dev.id} style={{ display: "flex", alignItems: "center", gap: "10px", backgroundColor: C.bg3, borderRadius: "10px", padding: "9px 11px" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: C.t1, fontSize: "12px", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px" }}>
                        {formatUserAgent(dev.user_agent)}
                        {dev.is_current_device && <span style={{ backgroundColor: `${C.green}15`, color: C.green, fontSize: "9px", fontWeight: "800", padding: "2px 6px", borderRadius: "8px" }}>Session actuelle</span>}
                      </div>
                      <div style={{ color: C.t3, fontSize: "10px", marginTop: "1px" }}>{dev.is_current_device ? "Actif maintenant" : `Dernière activité : ${timeAgo(dev.created_at)}`}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: C.t3, fontSize: "11px", marginBottom: "10px" }}>Aucun appareil mémorisé pour l&apos;instant.</div>
            )}
            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={() => onNavigate?.("parametres-securite")}>Voir tous les appareils</Button>
          </Card>
        </>
      )}

      {/* ── ACTIVITÉ DE CE COMPTE ── */}
      <SectionTitle C={C} label="Activité de ce compte"/>
      <Card tokens={toCardTokens(C)} padding="16px">
        {activite === null ? (
          <YelenLoader size={16}/>
        ) : activite.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {activite.map(e => {
              const appareil = [e.navigateur, e.os].filter(Boolean).join(" · ");
              return (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: "10px", backgroundColor: C.bg3, borderRadius: "10px", padding: "9px 11px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.t1, fontSize: "12px", fontWeight: "700" }}>{ACTIVITE_LABELS[e.action] ?? e.action}</div>
                    <div style={{ color: C.t3, fontSize: "10px", marginTop: "1px" }}>{appareil ? `${appareil} · ${timeAgo(e.created_at)}` : timeAgo(e.created_at)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ color: C.t3, fontSize: "11px" }}>Aucune activité récente enregistrée.</div>
        )}
      </Card>
    </div>
  );
}
