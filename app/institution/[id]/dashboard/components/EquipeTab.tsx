"use client";

// Gestion de l'équipe — visible uniquement par le rôle admin (appliqué
// côté serveur dans /api/institution/membres, ce composant n'affiche
// l'onglet que si l'appel réussit). Fondation multi-comptes, migration
// 20260714000001_institution_membres.sql. Tableau façon feuille de calcul
// (colonnes horizontales) + fiche détail au clic sur une ligne, niveau
// SaaS pro — refonte demandée le 15/07/2026 (écran jugé trop pauvre/muet).
import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../theme";
import { MEMBRE_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, isMembreRole, type MembreRole } from "@/lib/institutionPermissions";

type Membre = {
  id: string; identifiant: string | null; prenom: string; nom: string; role: MembreRole;
  actif: boolean; compte_principal: boolean; doit_changer_pin: boolean; created_at: string;
};

const ROLES: { value: MembreRole; label: string; description: string }[] =
  MEMBRE_ROLES.map(value => ({ value, label: ROLE_LABELS[value], description: ROLE_DESCRIPTIONS[value] }));

function roleColor(r: MembreRole, C: ThemeTokens): string {
  if (r === "admin") return C.gold;
  if (r === "comptable") return C.purple;
  if (r === "superviseur") return C.orange;
  if (r === "dirigeant") return C.teal;
  return C.blue;
}

function formatDateHeure(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function EquipeTab({ instId, onToast }: { instId: string; onToast: (msg: string, color?: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [membres, setMembres] = useState<Membre[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [viewerRole, setViewerRole] = useState<MembreRole | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [identifiant, setIdentifiant] = useState("");
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [role, setRole] = useState<MembreRole>("agent");
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Membre | null>(null);

  // Superviseur/dirigeant voient la liste (equipe.read_full côté serveur)
  // mais en lecture seule — aucune action de gestion d'équipe ne leur est
  // ouverte (réservé admin, cf lib/institutionPermissions.ts).
  const readOnly = viewerRole === "superviseur" || viewerRole === "dirigeant";

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/institution/membres");
    if (res.status === 403) { setForbidden(true); setLoading(false); return; }
    const j = await res.json().catch(() => null);
    setMembres(res.ok ? (j?.membres ?? []) : []);
    setViewerRole(res.ok && isMembreRole(j?.role) ? j.role : null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, instId]);

  async function creerMembre() {
    if (!identifiant.trim() || !prenom.trim() || !nom.trim() || !/^\d{6}$/.test(pin)) return;
    setSaving(true);
    const res = await fetch("/api/institution/membres", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifiant, prenom, nom, role, pin }),
    });
    const j = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) { onToast(j?.error || "Erreur de création", C.red); return; }
    setShowForm(false); setIdentifiant(""); setPrenom(""); setNom(""); setRole("agent"); setPin("");
    onToast(`${prenom} a été ajouté(e) à l'équipe`, C.green);
    load();
  }

  async function changerRole(id: string, newRole: MembreRole) {
    const res = await fetch("/api/institution/membres", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, role: newRole }),
    });
    if (!res.ok) { onToast("Erreur", C.red); return; }
    setMembres(prev => prev.map(m => m.id === id ? { ...m, role: newRole } : m));
    setSelected(prev => prev && prev.id === id ? { ...prev, role: newRole } : prev);
    onToast("Rôle mis à jour", C.green);
  }

  async function toggleActif(m: Membre) {
    const res = await fetch("/api/institution/membres", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: m.id, actif: !m.actif }),
    });
    if (!res.ok) { onToast("Erreur", C.red); return; }
    setMembres(prev => prev.map(x => x.id === m.id ? { ...x, actif: !x.actif } : x));
    setSelected(prev => prev && prev.id === m.id ? { ...prev, actif: !prev.actif } : prev);
    onToast(m.actif ? "Membre désactivé — il ne peut plus se connecter" : "Membre réactivé", C.orange);
  }

  async function supprimer(id: string) {
    const res = await fetch(`/api/institution/membres?id=${id}`, { method: "DELETE" });
    if (!res.ok) { onToast("Erreur de suppression", C.red); return; }
    setMembres(prev => prev.filter(m => m.id !== id));
    setSelected(null);
    onToast("Membre supprimé", C.orange);
  }

  if (loading) {
    return (
      <div style={{ padding: "48px 16px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "28px", height: "28px", border: `2px solid ${C.gold}20`, borderTopColor: C.gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div style={{ padding: "48px 16px", textAlign: "center" }}>
        <p style={{ color: C.t2, fontSize: "13px" }}>Cet écran est réservé aux administrateurs de l'institution.</p>
      </div>
    );
  }

  const equipeVide = membres.length <= 1;

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
        <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px" }}>Équipe</h1>
        {!readOnly && (
          <button onClick={() => setShowForm(v => !v)} className="tap" style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "800", fontSize: "12px", padding: "8px 14px", borderRadius: "10px", border: "none", cursor: "pointer" }}>+ Membre</button>
        )}
      </div>
      <p style={{ color: C.t2, fontSize: "13px", marginBottom: "16px" }}>
        {readOnly ? "Consultation de l'équipe — la gestion (ajout, rôle, statut) est réservée à l'administrateur." : "Créez des accès distincts pour chaque personne de votre établissement — chaque membre a son propre identifiant, PIN et rôle."}
      </p>

      {equipeVide && !showForm && !readOnly && (
        <div style={{ backgroundColor: `${C.gold}0c`, border: `1px solid ${C.gold}30`, borderRadius: "14px", padding: "14px", marginBottom: "16px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <span style={{ fontSize: "18px" }}>💡</span>
          <div>
            <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: "800", marginBottom: "3px" }}>Vous êtes seul pour l'instant</div>
            <div style={{ color: C.t2, fontSize: "11.5px", lineHeight: 1.5 }}>Ajoutez les premiers membres de votre équipe (médecin, secrétaire, comptable...) avec le bouton "+ Membre" — chacun se connectera avec son propre identifiant et PIN, jamais votre compte principal.</div>
          </div>
        </div>
      )}

      {showForm && (
        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px", marginBottom: "16px" }}>
          <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: "800", marginBottom: "12px" }}>Nouveau membre</div>

          <label style={{ display: "block", color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "5px" }}>Identifiant de connexion</label>
          <input value={identifiant} onChange={e => setIdentifiant(e.target.value)} placeholder="ex: dr.diallo" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "9px 11px", fontSize: "13px", marginBottom: "4px", color: C.t1 }}/>
          <p style={{ color: C.t3, fontSize: "10.5px", marginBottom: "12px" }}>C'est ce que le membre tapera pour se connecter — pas d'espace, unique dans tout Yelen224.</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
            <div>
              <label style={{ display: "block", color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "5px" }}>Prénom</label>
              <input value={prenom} onChange={e => setPrenom(e.target.value)} placeholder="Prénom" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "9px 11px", fontSize: "13px", color: C.t1 }}/>
            </div>
            <div>
              <label style={{ display: "block", color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "5px" }}>Nom</label>
              <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Nom" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "9px 11px", fontSize: "13px", color: C.t1 }}/>
            </div>
          </div>

          <label style={{ display: "block", color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "5px" }}>Rôle</label>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
            {ROLES.map(r => (
              <div key={r.value} onClick={() => setRole(r.value)} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 11px", borderRadius: "8px", backgroundColor: role === r.value ? `${roleColor(r.value, C)}12` : C.bg3, border: `1px solid ${role === r.value ? roleColor(r.value, C) + "40" : C.border2}`, cursor: "pointer" }}>
                <div style={{ width: "14px", height: "14px", borderRadius: "50%", border: `2px solid ${role === r.value ? roleColor(r.value, C) : C.t3}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {role === r.value && <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: roleColor(r.value, C) }}/>}
                </div>
                <div>
                  <div style={{ color: C.t1, fontSize: "12px", fontWeight: "700" }}>{r.label}</div>
                  <div style={{ color: C.t3, fontSize: "10.5px" }}>{r.description}</div>
                </div>
              </div>
            ))}
          </div>

          <label style={{ display: "block", color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "5px" }}>PIN initial</label>
          <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={6} placeholder="6 chiffres" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "9px", fontSize: "13px", color: C.t1, textAlign: "center", letterSpacing: "3px", marginBottom: "4px" }}/>
          <p style={{ color: C.t3, fontSize: "10.5px", marginBottom: "14px" }}>Communiquez ce code au membre — il devra en choisir un nouveau dès sa première connexion.</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <button onClick={() => setShowForm(false)} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, color: C.t2, fontWeight: "700", fontSize: "13px", padding: "11px", borderRadius: "10px", cursor: "pointer" }}>Annuler</button>
            <button onClick={creerMembre} disabled={saving || !identifiant.trim() || !prenom.trim() || !nom.trim() || !/^\d{6}$/.test(pin)} className="tap" style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "800", fontSize: "13px", padding: "11px", borderRadius: "10px", border: "none", cursor: "pointer", opacity: saving || !identifiant.trim() || !prenom.trim() || !nom.trim() || !/^\d{6}$/.test(pin) ? 0.5 : 1 }}>
              {saving ? "…" : "Créer le membre"}
            </button>
          </div>
        </div>
      )}

      {/* Tableau — colonnes horizontales façon feuille de calcul, défilement
          horizontal sur petit écran (mobile-first) plutôt qu'un tableau qui
          déborde silencieusement. */}
      <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: "14px", backgroundColor: C.bgCard }}>
        <table style={{ width: "100%", minWidth: "560px", borderCollapse: "collapse", fontSize: "12.5px" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {["Membre", "Identifiant", "Rôle", "Statut", "Créé le"].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {membres.map((m, i, arr) => (
              <tr key={m.id} onClick={() => setSelected(m)} className="tap" style={{ borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer", opacity: m.actif ? 1 : 0.5 }}>
                <td style={{ padding: "12px 14px", fontWeight: "700", color: C.t1, whiteSpace: "nowrap" }}>
                  {m.prenom} {m.nom}{m.compte_principal && <span style={{ color: C.t3, fontWeight: "500" }}> · Principal</span>}
                </td>
                <td style={{ padding: "12px 14px", color: C.t2, whiteSpace: "nowrap" }}>{m.identifiant || "Téléphone"}</td>
                <td style={{ padding: "12px 14px" }}>
                  <span style={{ color: roleColor(m.role, C), fontSize: "9.5px", fontWeight: "800", backgroundColor: `${roleColor(m.role, C)}15`, padding: "2px 8px", borderRadius: "20px", whiteSpace: "nowrap" }}>{ROLES.find(r => r.value === m.role)?.label}</span>
                </td>
                <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                  <span style={{ color: m.actif ? C.green : C.t3, fontSize: "11px", fontWeight: "700" }}>{m.actif ? "Actif" : "Désactivé"}</span>
                </td>
                <td style={{ padding: "12px 14px", color: C.t3, whiteSpace: "nowrap" }}>{formatDateHeure(m.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <MembreDetailModal
          C={C} membre={selected} readOnly={readOnly}
          onClose={() => setSelected(null)}
          onChangerRole={changerRole}
          onToggleActif={toggleActif}
          onSupprimer={supprimer}
          onToast={onToast}
        />
      )}
    </div>
  );
}

function MembreDetailModal({ C, membre, readOnly, onClose, onChangerRole, onToggleActif, onSupprimer, onToast }: {
  C: ThemeTokens; membre: Membre; readOnly: boolean; onClose: () => void;
  onChangerRole: (id: string, role: MembreRole) => void;
  onToggleActif: (m: Membre) => void;
  onSupprimer: (id: string) => void;
  onToast: (msg: string, color?: string) => void;
}) {
  const [showResetPin, setShowResetPin] = useState(false);
  const [nouveauPin, setNouveauPin] = useState("");
  const [saving, setSaving] = useState(false);

  async function reinitialiserPin() {
    if (!/^\d{6}$/.test(nouveauPin)) return;
    setSaving(true);
    const res = await fetch("/api/institution/membres", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: membre.id, pin: nouveauPin }),
    });
    setSaving(false);
    if (!res.ok) { onToast("Erreur", C.red); return; }
    setShowResetPin(false); setNouveauPin("");
    onToast("PIN réinitialisé — communiquez-le au membre", C.green);
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "20px 20px 0 0", padding: "22px", width: "100%", maxWidth: "480px", maxHeight: "88svh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "18px" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: `linear-gradient(135deg, ${roleColor(membre.role, C)}30, ${roleColor(membre.role, C)}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "17px", fontWeight: "900", color: roleColor(membre.role, C), flexShrink: 0 }}>
            {membre.prenom.slice(0, 1).toUpperCase()}{membre.nom.slice(0, 1).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: C.t1, fontSize: "16px", fontWeight: "800" }}>{membre.prenom} {membre.nom}</div>
            <div style={{ color: C.t3, fontSize: "11.5px" }}>{membre.compte_principal ? "Compte administrateur principal" : (membre.identifiant || "Connexion par téléphone")}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "18px" }}>
          <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px 12px" }}>
            <div style={{ color: C.t3, fontSize: "9.5px", fontWeight: "800", textTransform: "uppercase", marginBottom: "3px" }}>Rôle</div>
            <div style={{ color: roleColor(membre.role, C), fontSize: "13px", fontWeight: "800" }}>{ROLES.find(r => r.value === membre.role)?.label}</div>
          </div>
          <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px 12px" }}>
            <div style={{ color: C.t3, fontSize: "9.5px", fontWeight: "800", textTransform: "uppercase", marginBottom: "3px" }}>Statut</div>
            <div style={{ color: membre.actif ? C.green : C.t3, fontSize: "13px", fontWeight: "800" }}>{membre.actif ? "Actif" : "Désactivé"}</div>
          </div>
          <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px 12px", gridColumn: "1 / -1" }}>
            <div style={{ color: C.t3, fontSize: "9.5px", fontWeight: "800", textTransform: "uppercase", marginBottom: "3px" }}>Membre depuis</div>
            <div style={{ color: C.t1, fontSize: "13px", fontWeight: "700" }}>{formatDateHeure(membre.created_at)}</div>
          </div>
          {membre.doit_changer_pin && (
            <div style={{ backgroundColor: `${C.orange}12`, border: `1px solid ${C.orange}30`, borderRadius: "10px", padding: "10px 12px", gridColumn: "1 / -1" }}>
              <div style={{ color: C.orange, fontSize: "11px", fontWeight: "700" }}>⚠ N'a pas encore changé son PIN initial</div>
            </div>
          )}
        </div>

        {!membre.compte_principal && !readOnly && (
          <>
            <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Changer le rôle</div>
            <div style={{ display: "flex", gap: "6px", marginBottom: "16px", flexWrap: "wrap" }}>
              {ROLES.map(r => (
                <button key={r.value} onClick={() => onChangerRole(membre.id, r.value)} disabled={r.value === membre.role} style={{ backgroundColor: r.value === membre.role ? `${roleColor(r.value, C)}15` : C.bg3, border: `1px solid ${r.value === membre.role ? roleColor(r.value, C) + "40" : C.border}`, color: r.value === membre.role ? roleColor(r.value, C) : C.t2, fontSize: "11.5px", fontWeight: "700", padding: "8px 12px", borderRadius: "8px", cursor: r.value === membre.role ? "default" : "pointer" }}>{r.label}</button>
              ))}
            </div>
          </>
        )}

        {showResetPin ? (
          <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "12px", marginBottom: "12px" }}>
            <div style={{ color: C.t2, fontSize: "11.5px", marginBottom: "8px" }}>Nouveau PIN à 6 chiffres pour {membre.prenom} :</div>
            <input value={nouveauPin} onChange={e => setNouveauPin(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={6} placeholder="6 chiffres" style={{ width: "100%", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "9px", fontSize: "14px", color: C.t1, textAlign: "center", letterSpacing: "3px", marginBottom: "8px" }}/>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <button onClick={() => { setShowResetPin(false); setNouveauPin(""); }} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, color: C.t2, fontWeight: "700", fontSize: "12px", padding: "9px", borderRadius: "8px", cursor: "pointer" }}>Annuler</button>
              <button onClick={reinitialiserPin} disabled={saving || !/^\d{6}$/.test(nouveauPin)} style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "800", fontSize: "12px", padding: "9px", borderRadius: "8px", border: "none", cursor: "pointer", opacity: saving || !/^\d{6}$/.test(nouveauPin) ? 0.5 : 1 }}>{saving ? "…" : "Valider"}</button>
            </div>
          </div>
        ) : (
          !membre.compte_principal && !readOnly && (
            <button onClick={() => setShowResetPin(true)} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border}`, color: C.t2, fontWeight: "700", fontSize: "12.5px", padding: "11px", borderRadius: "10px", cursor: "pointer", marginBottom: "10px" }}>Réinitialiser le PIN</button>
          )
        )}

        {!membre.compte_principal && !readOnly && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
            <button onClick={() => onToggleActif(membre)} style={{ backgroundColor: `${C.orange}12`, border: `1px solid ${C.orange}30`, color: C.orange, fontWeight: "700", fontSize: "12.5px", padding: "11px", borderRadius: "10px", cursor: "pointer" }}>{membre.actif ? "Désactiver" : "Réactiver"}</button>
            <button onClick={() => onSupprimer(membre.id)} style={{ backgroundColor: C.redL, border: `1px solid ${C.red}30`, color: C.red, fontWeight: "700", fontSize: "12.5px", padding: "11px", borderRadius: "10px", cursor: "pointer" }}>Supprimer</button>
          </div>
        )}

        <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", color: C.t3, fontSize: "12px", cursor: "pointer", padding: "8px" }}>Fermer</button>
      </div>
    </div>
  );
}
