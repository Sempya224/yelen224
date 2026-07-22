"use client";

import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { VILLES_GUINEE } from "@/lib/villes";
import { CompteHeader } from "@/components/CompteEcranVide";
import { updateInfosPersonnelles } from "./actions";
import { deleteCitoyenAccount } from "@/app/profil/actions";
import { LogoutFlow, CITOYEN_LOGOUT_COPY } from "@/components/LogoutFlow";

type Sexe = "homme" | "femme";

type UserRow = {
  id: string;
  phone?: string | null;
  prenom?: string | null;
  nom?: string | null;
  photo_url?: string | null;
  ville?: string | null;
  date_naissance?: string | null;
  sexe?: Sexe | null;
  nationalite?: string | null;
  profession?: string | null;
  adresse?: string | null;
  email?: string | null;
};

function initials(prenom: string, nom: string): string {
  const a = prenom[0]?.toUpperCase() ?? "";
  const b = nom[0]?.toUpperCase() ?? "";
  return (a + b) || "?";
}

function formatPhone(u: UserRow): string {
  const raw = u.phone ?? "";
  if (!raw) return "—";
  return raw.startsWith("+") ? raw : `+${raw}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Non renseignée";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

const P = { pointerEvents: "none" as const };
const Ic = {
  Camera: () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.2" strokeLinecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  Trash:  () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/></svg>,
  Out:    () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Shield: () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
};

export function InformationsPersonnellesClient() {
  const router = useRouter();
  const { theme } = useTheme();
  const C = T[theme];
  const isDark = theme === "dark";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [user, setUser] = useState<UserRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [ville, setVille] = useState("");
  const [dateNaissance, setDateNaissance] = useState("");
  const [sexe, setSexe] = useState<Sexe | "">("");
  const [nationalite, setNationalite] = useState("");
  const [profession, setProfession] = useState("");
  const [adresse, setAdresse] = useState("");
  const [email, setEmail] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  const loadUser = useCallback(async (id: string) => {
    setLoadError(null);
    const { data, error } = await supabase
      .from("users")
      .select("id,phone,prenom,nom,photo_url,ville,date_naissance,sexe,nationalite,profession,adresse,email")
      .eq("id", id)
      .maybeSingle();

    if (error) { setLoadError(error.message); setUser(null); return; }
    if (!data) { setLoadError("Profil introuvable."); setUser(null); return; }

    const row = data as UserRow;
    setUser(row);
    setPrenom((row.prenom ?? "").trim());
    setNom((row.nom ?? "").trim());
    setVille((row.ville ?? "").trim());
    setDateNaissance(row.date_naissance ?? "");
    setSexe(row.sexe ?? "");
    setNationalite((row.nationalite ?? "").trim());
    setProfession((row.profession ?? "").trim());
    setAdresse((row.adresse ?? "").trim());
    setEmail((row.email ?? "").trim());
    setPreview(null);
    setFile(null);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!id) { router.replace("/inscription"); return; }
    setUserId(id);
    void (async () => { setLoading(true); await loadUser(id); setLoading(false); })();
  }, [router, loadUser]);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Même contournement que /profil (voir app/profil/profil-client.tsx) :
  // upload via service_role, route générique réutilisée telle quelle.
  async function uploadPhotoIfNeeded(accessToken: string): Promise<string | null> {
    if (!file) return null;
    const fd = new FormData();
    fd.append("accessToken", accessToken);
    fd.append("file", file);
    const res = await fetch("/api/citoyen/profil/photo", { method: "POST", body: fd });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("[informations-personnelles] photo upload:", body?.error ?? res.status);
      return null;
    }
    const data = await res.json().catch(() => null);
    return data?.url ?? null;
  }

  async function saveInfos(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setFormError(null);
    const p = prenom.trim();
    const n = nom.trim();
    if (!p || !n) { setFormError("Prénom et nom sont obligatoires."); return; }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setFormError("Session expirée, reconnectez-vous."); return; }

      let photoUrl: string | undefined = undefined;
      if (file) {
        const uploaded = await uploadPhotoIfNeeded(session.access_token);
        if (!uploaded) { setFormError("La photo n'a pas pu être envoyée. Réessayez."); return; }
        photoUrl = uploaded;
      }

      const result = await updateInfosPersonnelles(userId, session.access_token, {
        prenom: p, nom: n, ville, photoUrl,
        dateNaissance: dateNaissance || null,
        sexe: sexe || null,
        nationalite, profession, adresse, email,
      });
      if (!result.ok) { setFormError(result.error); return; }
      await loadUser(userId);
      setFile(null);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    if (!userId) return;
    setEditing(false);
    setFormError(null);
    setFile(null);
    void loadUser(userId);
  }

  async function handleDelete() {
    if (!userId) return;
    if (!window.confirm("Supprimer définitivement votre compte ? Cette action est irréversible.")) return;
    setDeleting(true);
    setFormError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setFormError("Session expirée, reconnectez-vous."); return; }
      const result = await deleteCitoyenAccount(userId, session.access_token);
      if (!result.ok) { setFormError(result.error); return; }
      await supabase.auth.signOut();
      localStorage.removeItem(YELEN224_USER_ID_KEY);
      router.replace("/");
    } finally {
      setDeleting(false);
    }
  }

  const displayPhoto = preview ?? (user?.photo_url ? String(user.photo_url) : null);
  const cardBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.8)";
  const cardBord = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";
  const subText = C.textSubtle;

  const inputStyle: React.CSSProperties = {
    width: "100%", backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#f5f5f8",
    border: `1px solid ${cardBord}`, borderRadius: "12px", padding: "12px 14px",
    color: C.text, fontSize: "14px", fontFamily: "inherit",
  };
  const labelStyle: React.CSSProperties = {
    color: subText, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em",
    display: "block", marginBottom: "7px", fontWeight: 700,
  };

  const PhotoPicker = ({ size = 96 }: { size?: number }) => (
    <div style={{ position: "relative", width: `${size}px`, height: `${size}px`, flexShrink: 0 }}>
      <div style={{ width: "100%", height: "100%", borderRadius: "24px", overflow: "hidden", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${cardBord}` }}>
        {displayPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={displayPhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
        ) : (
          <span style={{ color: "#080812", fontSize: `${Math.round(size * 0.32)}px`, fontWeight: 900 }}>{initials(prenom, nom)}</span>
        )}
      </div>
      <button type="button" onClick={() => fileInputRef.current?.click()} className="tap" style={{ position: "absolute", bottom: "-4px", right: "-4px", width: "32px", height: "32px", borderRadius: "50%", background: "#F5A623", border: `2px solid ${C.pageBg}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <Ic.Camera/>
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} style={{ display: "none" }}/>
    </div>
  );

  // Ligne d'information en lecture seule — inspirée de l'écran "Personal
  // details" de Booking (référence visuelle uniquement : structure en
  // lignes label/valeur groupées par section — pas une copie, le système
  // Yelen n'a rien d'identique à Booking, notamment le flux d'édition qui
  // reste un formulaire unique comme le reste de l'app, pas un écran par
  // champ).
  const Ligne = ({ label, valeur }: { label: string; valeur: string }) => (
    <div style={{ padding: "12px 16px" }}>
      <div style={{ color: subText, fontSize: "12px", fontWeight: 700 }}>{label}</div>
      <div style={{ color: C.text, fontSize: "14.5px", fontWeight: 600, marginTop: "2px" }}>{valeur}</div>
    </div>
  );

  if (loading || !userId) {
    return (
      <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "40px", height: "40px", border: `3px solid ${isDark ? "rgba(245,166,35,0.15)" : "rgba(245,166,35,0.2)"}`, borderTopColor: "#F5A623", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (loadError || !user) {
    return (
      <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", padding: "24px", textAlign: "center" }}>
        <p style={{ color: "#ef4444", fontSize: "13px" }}>{loadError ?? "Erreur."}</p>
        <button onClick={() => router.push("/")} className="tap" style={{ color: "#F5A623", fontSize: "13px", fontWeight: 700, background: "none", border: "none", cursor: "pointer" }}>Retour à l'accueil</button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, color: C.text, fontFamily: "'SF Pro Text',-apple-system,'Helvetica Neue',sans-serif", transition: "background-color 0.3s ease" }}>
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .tap{transition:opacity 0.12s,transform 0.12s;cursor:pointer;touch-action:manipulation}
        .tap:active{opacity:0.6;transform:scale(0.96)}
        input:focus,select:focus{outline:none;border-color:#F5A623 !important}
      `}</style>

      <CompteHeader titre="Informations personnelles"/>

      <main style={{ padding: "16px 16px 40px", maxWidth: "560px", margin: "0 auto", animation: "fadeUp 0.25s ease" }}>
        {/* MESSAGE DE CONFIANCE — ces champs sont sensibles (date de
            naissance, nationalité, adresse...), retour Bryan 18/07/2026 :
            rassurer clairement sans survendre une garantie technique non
            vérifiée (pas de mention de chiffrement précis, seulement ce
            qui est réellement vrai : accès restreint par compte, pas de
            partage sans consentement). */}
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", backgroundColor: isDark ? "rgba(34,197,94,0.06)" : "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.18)", borderRadius: "16px", padding: "14px 16px", marginBottom: "18px" }}>
          <div style={{ flexShrink: 0, marginTop: "1px" }}><Ic.Shield/></div>
          <div>
            <div style={{ color: C.text, fontSize: "13px", fontWeight: 700, marginBottom: "3px" }}>Vos informations restent confidentielles</div>
            <div style={{ color: subText, fontSize: "12.5px", lineHeight: 1.5 }}>Elles sont réservées à votre compte Yelen et ne sont jamais vendues ni partagées à des tiers. Seule l'institution avec laquelle vous prenez rendez-vous accède aux informations strictement nécessaires au traitement de votre dossier.</div>
          </div>
        </div>

        {editing ? (
          <div style={{ backgroundColor: cardBg, border: `1px solid ${cardBord}`, borderRadius: "20px", padding: "22px 20px" }}>
            <h2 style={{ color: C.text, fontSize: "18px", fontWeight: 900, margin: "0 0 20px", letterSpacing: "-0.3px" }}>Modifier mes informations</h2>

            <form onSubmit={saveInfos} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", justifyContent: "center" }}><PhotoPicker size={104}/></div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={labelStyle}>Prénom *</label>
                  <input value={prenom} onChange={e => setPrenom(e.target.value)} required style={inputStyle}/>
                </div>
                <div>
                  <label style={labelStyle}>Nom *</label>
                  <input value={nom} onChange={e => setNom(e.target.value)} required style={inputStyle}/>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={labelStyle}>Sexe</label>
                  <select value={sexe} onChange={e => setSexe(e.target.value as Sexe | "")} style={inputStyle}>
                    <option value="">Non précisé</option>
                    <option value="homme">Homme</option>
                    <option value="femme">Femme</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Date de naissance</label>
                  <input type="date" value={dateNaissance} onChange={e => setDateNaissance(e.target.value)} style={inputStyle}/>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={labelStyle}>Nationalité</label>
                  <input value={nationalite} onChange={e => setNationalite(e.target.value)} style={inputStyle} placeholder="Ex : Guinéenne"/>
                </div>
                <div>
                  <label style={labelStyle}>Profession</label>
                  <input value={profession} onChange={e => setProfession(e.target.value)} style={inputStyle}/>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle}/>
              </div>

              <div>
                <label style={labelStyle}>Adresse</label>
                <input value={adresse} onChange={e => setAdresse(e.target.value)} style={inputStyle}/>
              </div>

              <div>
                <label style={labelStyle}>Ville</label>
                <select value={ville} onChange={e => setVille(e.target.value)} style={inputStyle}>
                  <option value="">Sélectionner votre ville</option>
                  {VILLES_GUINEE.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>

              {formError && <p style={{ color: "#ef4444", fontSize: "13px", margin: 0 }} role="alert">{formError}</p>}
              {saving && <p style={{ color: "#F5A623", fontSize: "13px", margin: 0 }}>Enregistrement…</p>}

              <div style={{ display: "flex", gap: "10px" }}>
                <button type="submit" disabled={saving} className="tap" style={{ flex: 1, padding: "13px", borderRadius: "14px", background: saving ? cardBg : "linear-gradient(135deg,#F5A623,#C8940A)", border: "none", color: saving ? subText : "#080812", fontWeight: 800, fontSize: "13.5px", cursor: saving ? "default" : "pointer" }}>
                  Enregistrer
                </button>
                <button type="button" onClick={cancelEdit} disabled={saving} className="tap" style={{ flex: 1, padding: "13px", borderRadius: "14px", background: "transparent", border: `1px solid ${cardBord}`, color: C.text, fontWeight: 700, fontSize: "13.5px", cursor: "pointer" }}>
                  Annuler
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div style={{ backgroundColor: cardBg, border: `1px solid ${cardBord}`, borderRadius: "20px", padding: "22px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
                <PhotoPicker size={72}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: C.text, fontSize: "18px", fontWeight: 800, margin: "0 0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prenom} {nom}</p>
                  <p style={{ color: subText, fontSize: "13px", margin: 0 }}>{formatPhone(user)}</p>
                </div>
              </div>
              <button type="button" onClick={() => { setFormError(null); setEditing(true); }} className="tap" style={{ width: "100%", padding: "13px", borderRadius: "14px", background: "linear-gradient(135deg,#F5A623,#C8940A)", border: "none", color: "#080812", fontWeight: 800, fontSize: "13.5px", cursor: "pointer" }}>
                Modifier mes informations
              </button>
            </div>

            <div style={{ backgroundColor: cardBg, border: `1px solid ${cardBord}`, borderRadius: "20px", overflow: "hidden" }}>
              <div style={{ padding: "14px 16px 4px", color: "#F5A623", fontSize: "10px", fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase" }}>Identité</div>
              <div style={{ borderTop: `1px solid ${cardBord}`, margin: "10px 0 0" }}/>
              <Ligne label="Sexe" valeur={sexe === "homme" ? "Homme" : sexe === "femme" ? "Femme" : "Non précisé"}/>
              <div style={{ borderTop: `1px solid ${cardBord}` }}/>
              <Ligne label="Date de naissance" valeur={formatDate(dateNaissance)}/>
              <div style={{ borderTop: `1px solid ${cardBord}` }}/>
              <Ligne label="Nationalité" valeur={nationalite || "Non renseignée"}/>
              <div style={{ borderTop: `1px solid ${cardBord}` }}/>
              <Ligne label="Profession" valeur={profession || "Non renseignée"}/>
            </div>

            <div style={{ backgroundColor: cardBg, border: `1px solid ${cardBord}`, borderRadius: "20px", overflow: "hidden" }}>
              <div style={{ padding: "14px 16px 4px", color: "#F5A623", fontSize: "10px", fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase" }}>Coordonnées</div>
              <div style={{ borderTop: `1px solid ${cardBord}`, margin: "10px 0 0" }}/>
              <div style={{ padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ color: subText, fontSize: "12px", fontWeight: 700 }}>Téléphone</div>
                  <span style={{ color: "#22c55e", fontSize: "9px", fontWeight: 800, background: "rgba(34,197,94,0.12)", padding: "1px 7px", borderRadius: "20px" }}>CONNEXION</span>
                </div>
                <div style={{ color: C.text, fontSize: "14.5px", fontWeight: 600, marginTop: "2px" }}>{formatPhone(user)}</div>
              </div>
              <div style={{ borderTop: `1px solid ${cardBord}` }}/>
              <Ligne label="Email" valeur={email || "Non renseigné"}/>
              <div style={{ borderTop: `1px solid ${cardBord}` }}/>
              <Ligne label="Adresse" valeur={adresse || "Non renseignée"}/>
              <div style={{ borderTop: `1px solid ${cardBord}` }}/>
              <Ligne label="Ville" valeur={ville || "Non renseignée"}/>
            </div>

            <div style={{ backgroundColor: cardBg, border: `1px solid ${cardBord}`, borderRadius: "20px", padding: "18px 20px" }}>
              <div style={{ fontSize: "14px", fontWeight: 800, marginBottom: "14px", letterSpacing: "-0.2px" }}>Gérer mon compte</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <button type="button" onClick={() => setLogoutOpen(true)} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "12px 14px", borderRadius: "12px", background: "transparent", border: `1px solid ${cardBord}`, color: C.text, fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
                  <Ic.Out/> Déconnexion
                </button>
                <button type="button" onClick={handleDelete} disabled={deleting} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "12px 14px", borderRadius: "12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", fontWeight: 700, fontSize: "13px", cursor: deleting ? "default" : "pointer" }}>
                  <Ic.Trash/> {deleting ? "Suppression…" : "Supprimer mon compte"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {logoutOpen && (
        <LogoutFlow
          onClose={() => setLogoutOpen(false)}
          redirectTo="/login?logged_out=1"
          copy={CITOYEN_LOGOUT_COPY}
        />
      )}
    </div>
  );
}
