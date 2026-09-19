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
import { YelenLoader } from "@/components/YelenLoader";
import { ETAPES_PARCOURS_YELEN, type EtapeParcoursEtat } from "@/lib/parcoursYelen";

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

// Yelen Rewards Phase 2 (22/08/2026, décision CEO) — mêmes 10 champs que
// CHAMPS_PROFIL_COMPLET côté serveur (app/compte/informations-personnelles/
// actions.ts), dupliqués ici volontairement : ce composant n'a accès qu'à
// son propre état déjà chargé, pas de module isomorphe client/serveur
// existant dans ce projet pour ce genre de petite liste (même convention
// que lib/citoyenDemarchesRappels.ts vs. les Edge Functions).
const CHAMPS_PROFIL_REWARD: { label: string; rempli: (v: { prenom: string; nom: string; ville: string; dateNaissance: string; sexe: string; nationalite: string; profession: string; adresse: string; email: string; photo: boolean }) => boolean }[] = [
  { label: "Prénom", rempli: v => !!v.prenom },
  { label: "Nom", rempli: v => !!v.nom },
  { label: "Ville", rempli: v => !!v.ville },
  { label: "Date de naissance", rempli: v => !!v.dateNaissance },
  { label: "Sexe", rempli: v => !!v.sexe },
  { label: "Nationalité", rempli: v => !!v.nationalite },
  { label: "Profession", rempli: v => !!v.profession },
  { label: "Adresse", rempli: v => !!v.adresse },
  { label: "Email", rempli: v => !!v.email },
  { label: "Photo de profil", rempli: v => v.photo },
];

const P = { pointerEvents: "none" as const };
const Ic = {
  Camera: () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.2" strokeLinecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  Shield: () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Award:  () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>,
  X:      () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Chev:   () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>,
  Check:  () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
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
  const [editing, setEditing] = useState(false);
  // "Votre parcours Yelen" (retour Bryan 27/08/2026) — même source que
  // components/ParcoursYelenBandeau.tsx (GET /api/citoyen/assistant),
  // fetch indépendant ici : bandeau au rendu/copie différents (ancré sur
  // "compléter le profil", pas générique), pas de raison de coupler les
  // deux composants. Fermeture session-only (aucune persistance), même
  // convention que partout ailleurs sur ce chantier.
  const [parcoursEtapes, setParcoursEtapes] = useState<EtapeParcoursEtat[] | null>(null);
  const [bandeauFerme, setBandeauFerme] = useState(false);
  // Succès "profil complété" (retour Bryan 27/08/2026) — état local
  // uniquement, jamais persisté : ne peut devenir true qu'à l'instant où
  // saveInfos() fait basculer le profil d'incomplet à complet, donc
  // s'affiche naturellement une seule fois (un remontage de l'écran ne
  // peut pas le redéclencher, la transition ne se reproduit pas).
  const [justCompleted, setJustCompleted] = useState(false);
  // X du bandeau de confiance (retour Bryan 27/08/2026) — état local
  // uniquement, réinitialisé à chaque montage : réapparaît donc à chaque
  // ouverture de l'écran, jamais un "ne plus jamais afficher".
  const [confianceFerme, setConfianceFerme] = useState(false);

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
    let annule = false;
    void (async () => {
      if (!userId) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      try {
        const res = await fetch("/api/citoyen/assistant", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const json = await res.json().catch(() => null);
        if (!annule && res.ok && json?.success) setParcoursEtapes(json.parcours?.etapes ?? null);
      } catch { /* silencieux — bandeau annexe */ }
    })();
    return () => { annule = true; };
  }, [userId]);

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
    // Capturé avant l'enregistrement (retour Bryan 27/08/2026) : le succès
    // "+150 points" ne doit s'afficher que si CETTE sauvegarde précise
    // fait passer le profil d'incomplet à complet, jamais à chaque
    // modification une fois déjà complet.
    const etaitIncomplet = champsManquants.length > 0;

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
      const maintenantComplet = CHAMPS_PROFIL_REWARD.every(c => c.rempli({
        prenom: p, nom: n, ville, dateNaissance, sexe, nationalite, profession, adresse, email,
        photo: !!(photoUrl ?? displayPhoto),
      }));
      if (etaitIncomplet && maintenantComplet) setJustCompleted(true);
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

  const displayPhoto = preview ?? (user?.photo_url ? String(user.photo_url) : null);
  // Yelen Rewards Phase 2 — CTA "profil complet" (retour Bryan 22/08/2026 :
  // "si 1 manquant, on peut ajouter CTA"). Recalculé à partir de l'état
  // déjà chargé, jamais un appel réseau supplémentaire pour ça.
  const champsManquants = CHAMPS_PROFIL_REWARD.filter(c => !c.rempli({ prenom, nom, ville, dateNaissance, sexe, nationalite, profession, adresse, email, photo: !!displayPhoto })).map(c => c.label);
  // "Enregistrer" désactivé tant que rien n'a réellement changé (retour
  // Bryan 29/08/2026, "pour éviter la confusion") — même principe que
  // app/menu/interets/interets-client.tsx::estDifferent. Comparé aux
  // valeurs telles que chargées par loadUser() (même trim), pas à `user`
  // brut, pour ne jamais détecter un faux "modifié" causé uniquement par
  // le nettoyage des espaces au chargement.
  const estModifie = !!file
    || prenom !== (user?.prenom ?? "").trim()
    || nom !== (user?.nom ?? "").trim()
    || ville !== (user?.ville ?? "").trim()
    || dateNaissance !== (user?.date_naissance ?? "")
    || sexe !== (user?.sexe ?? "")
    || nationalite !== (user?.nationalite ?? "").trim()
    || profession !== (user?.profession ?? "").trim()
    || adresse !== (user?.adresse ?? "").trim()
    || email !== (user?.email ?? "").trim();
  // Cartes sans bordure (retour Bryan 29/08/2026, "trop carte web" comparé
  // au menu Compte déjà existant) — la séparation visuelle vient
  // uniquement du contraste de fond avec la page (mêmes valeurs que les
  // listes groupées iOS natives : carte blanche pleine sur fond gris clair,
  // jamais un simple blanc semi-transparent qui se fondrait dans la page).
  const cardBg = isDark ? "rgba(255,255,255,0.04)" : "#FFFFFF";
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
      <div style={{ width: "100%", height: "100%", borderRadius: "24px", overflow: "hidden", background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${cardBord}` }}>
        {displayPhoto ? (
          // IMG-EXCEPTION: reason=displayPhoto vaut soit une URL blob: locale (nouvel upload via preview) soit l'URL réelle photo_url, non fetchable par l'optimiseur next/image dans le cas blob | reviewed=2026-08-08
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
  const Ligne = ({ label, valeur, badge }: { label: string; valeur: string; badge?: { texte: string; verifie: boolean } }) => (
    <div style={{ padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ color: subText, fontSize: "12px", fontWeight: 700 }}>{label}</div>
        {badge && (
          <span style={{
            color: badge.verifie ? "#22c55e" : "#ef4444", fontSize: "9px", fontWeight: 800,
            background: badge.verifie ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
            padding: "1px 7px", borderRadius: "20px",
          }}>{badge.texte}</span>
        )}
      </div>
      <div style={{ color: C.text, fontSize: "14.5px", fontWeight: 600, marginTop: "2px" }}>{valeur}</div>
    </div>
  );

  if (loading || !userId) {
    return (
      <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <YelenLoader size={40}/>
      </div>
    );
  }

  if (loadError || !user) {
    return (
      <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", padding: "24px", textAlign: "center" }}>
        <p style={{ color: "#ef4444", fontSize: "13px" }}>{loadError ?? "Erreur."}</p>
        <button onClick={() => router.push("/")} className="tap" style={{ color: "#F5A623", fontSize: "13px", fontWeight: 700, background: "none", border: "none", cursor: "pointer" }}>Retour à l&apos;accueil</button>
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

      <main style={{ padding: editing ? "16px 16px 110px" : "16px 16px 40px", animation: "fadeUp 0.25s ease" }}>
        {/* MESSAGE DE CONFIANCE — ces champs sont sensibles (date de
            naissance, nationalité, adresse...), retour Bryan 18/07/2026 :
            rassurer clairement sans survendre une garantie technique non
            vérifiée (pas de mention de chiffrement précis, seulement ce
            qui est réellement vrai : accès restreint par compte, pas de
            partage sans consentement). */}
        {!confianceFerme && (
          <div style={{ position: "relative", display: "flex", gap: "12px", alignItems: "flex-start", backgroundColor: isDark ? "rgba(34,197,94,0.06)" : "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.18)", borderRadius: "16px", padding: "14px 46px 14px 16px", marginBottom: "18px" }}>
            <div style={{ flexShrink: 0, marginTop: "1px" }}><Ic.Shield/></div>
            <div>
              <div style={{ color: C.text, fontSize: "13px", fontWeight: 700, marginBottom: "3px" }}>Vos informations restent confidentielles</div>
              <div style={{ color: subText, fontSize: "12.5px", lineHeight: 1.5 }}>Elles sont réservées à votre compte Yelen et ne sont jamais vendues ni partagées à des tiers. Seule l&apos;institution avec laquelle vous prenez rendez-vous accède aux informations strictement nécessaires au traitement de votre dossier.</div>
            </div>
            <button type="button" onClick={() => setConfianceFerme(true)} aria-label="Fermer" className="tap" style={{ position: "absolute", top: "6px", right: "6px", width: "36px", height: "36px", borderRadius: "50%", background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)", border: "none", cursor: "pointer", color: subText, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Ic.X/>
            </button>
          </div>
        )}

        {editing ? (
          <div style={{ backgroundColor: cardBg, borderRadius: "20px", padding: "22px 20px" }}>
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

              {/* Barre d'action fixe en bas (retour Bryan 29/08/2026, façon
                  DoorDash) — même pattern déjà utilisé par
                  app/menu/interets/interets-client.tsx (dégradé transparent
                  → fond de page, jamais une ligne dure), repris tel quel
                  plutôt que réinventé. Reste dans le <form> (position:fixed
                  la sort du flux sans la sortir du DOM) pour que le bouton
                  "Enregistrer" continue de déclencher onSubmit normalement. */}
              <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50, display: "flex", gap: "10px", padding: "12px 16px calc(env(safe-area-inset-bottom) + 12px)", background: `linear-gradient(180deg, transparent, ${C.pageBg} 30%)` }}>
                <button type="submit" disabled={saving || !estModifie} className="tap" style={{ flex: 1, padding: "13px", borderRadius: "14px", background: (saving || !estModifie) ? cardBg : "#F5A623", border: "none", color: (saving || !estModifie) ? subText : "#080812", fontWeight: 800, fontSize: "13.5px", cursor: (saving || !estModifie) ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                  {saving ? <><YelenLoader size={14} color={subText}/>Enregistrement…</> : "Enregistrer"}
                </button>
                <button type="button" onClick={cancelEdit} disabled={saving} className="tap" style={{ flex: 1, padding: "13px", borderRadius: "14px", background: cardBg, border: `1px solid ${cardBord}`, color: C.text, fontWeight: 700, fontSize: "13.5px", cursor: "pointer" }}>
                  Annuler
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div style={{ backgroundColor: cardBg, borderRadius: "20px", padding: "22px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
                <PhotoPicker size={72}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: C.text, fontSize: "18px", fontWeight: 800, margin: "0 0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prenom} {nom}</p>
                  <p style={{ color: subText, fontSize: "13px", margin: 0 }}>{formatPhone(user)}</p>
                </div>
              </div>
              <button type="button" onClick={() => { setFormError(null); setEditing(true); }} className="tap" style={{ width: "100%", padding: "13px", borderRadius: "14px", background: "#F5A623", border: "none", color: "#080812", fontWeight: 800, fontSize: "13.5px", cursor: "pointer" }}>
                Modifier mes informations
              </button>
            </div>

            {/* Succès "profil complété" (retour Bryan 27/08/2026) — affiché
                une seule fois (voir justCompleted), juste après la
                sauvegarde qui vient de compléter le profil. +150 points
                déjà réellement accordés côté serveur (updateInfosPersonnelles
                → accorderPoints), ce bandeau ne fait que le refléter. */}
            {justCompleted && (
              <div style={{ position: "relative", backgroundColor: cardBg, border: "1px solid rgba(34,197,94,0.3)", borderRadius: "10px", padding: "16px", overflow: "hidden" }}>
                <button type="button" onClick={() => setJustCompleted(false)} aria-label="Fermer" className="tap" style={{ position: "absolute", top: "6px", right: "6px", width: "36px", height: "36px", borderRadius: "50%", background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)", border: "none", cursor: "pointer", color: subText, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Ic.X/>
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px", paddingRight: "42px" }}>
                  <Ic.Check/>
                  <div style={{ color: C.text, fontSize: "14.5px", fontWeight: 800 }}>Profil complété</div>
                </div>
                <div style={{ color: subText, fontSize: "12.5px", lineHeight: 1.5, marginBottom: "14px" }}>
                  Vous avez obtenu <span style={{ color: "#F5A623", fontWeight: 800 }}>+150 points</span> sur Yelen Rewards.
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button type="button" onClick={() => router.push("/compte/parcours-yelen")} className="tap" style={{ flex: 1, padding: "11px", borderRadius: "10px", background: "#F5A623", border: "none", color: "#080812", fontWeight: 800, fontSize: "12.5px", cursor: "pointer" }}>
                    Continuer mon parcours
                  </button>
                  <button type="button" onClick={() => router.push("/menu/recompenses")} className="tap" style={{ flex: 1, padding: "11px", borderRadius: "10px", background: "transparent", border: `1px solid ${cardBord}`, color: C.text, fontWeight: 800, fontSize: "12.5px", cursor: "pointer" }}>
                    Voir Yelen Rewards
                  </button>
                </div>
              </div>
            )}

            {/* "Complétez votre profil" — refonte retour Bryan 27/08/2026 :
                fond clair (plus de noir), coins quasi carrés, X pour fermer
                (session uniquement — aucune persistance, réapparaît au
                prochain chargement tant que l'étape n'est pas complétée,
                même convention que components/ParcoursYelenBandeau.tsx).
                +150 points reste la vraie valeur de reward_rules
                (profil_complete). La frise reprend l'état réel des 5
                étapes du parcours Yelen (GET /api/citoyen/assistant),
                jamais une valeur inventée. */}
            {champsManquants.length > 0 && !bandeauFerme && (
              <div style={{ position: "relative", backgroundColor: cardBg, borderRadius: "10px", overflow: "hidden" }}>
                <button type="button" onClick={(e) => { e.stopPropagation(); setBandeauFerme(true); }} aria-label="Fermer" className="tap" style={{ position: "absolute", top: "6px", right: "6px", width: "36px", height: "36px", borderRadius: "50%", background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)", border: "none", cursor: "pointer", color: subText, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
                  <Ic.X/>
                </button>
                <button type="button" onClick={() => { setFormError(null); setEditing(true); }} className="tap" style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "16px 44px 16px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                    <div style={{ width: "34px", height: "34px", borderRadius: "9px", background: isDark ? "rgba(245,166,35,0.14)" : "rgba(245,166,35,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ic.Award/></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: C.text, fontSize: "14.5px", fontWeight: 800 }}>Complétez votre profil</div>
                      <div style={{ color: subText, fontSize: "12px", marginTop: "1px" }}>
                        {champsManquants.length > 1 ? `Encore ${champsManquants.length} étapes pour compléter votre profil.` : "Encore 1 étape pour compléter votre profil."}
                      </div>
                    </div>
                    <span style={{ flexShrink: 0, background: "#F5A623", color: "#080812", fontSize: "11px", fontWeight: 800, padding: "5px 10px", borderRadius: "8px" }}>+150 pts</span>
                  </div>
                  <div style={{ display: "flex", gap: "4px" }}>
                    {ETAPES_PARCOURS_YELEN.map((etape) => {
                      const fait = parcoursEtapes?.find((e) => e.code === etape.code)?.complete ?? false;
                      return <div key={etape.code} style={{ flex: 1, height: "4px", borderRadius: "2px", background: fait ? "#F5A623" : cardBord }}/>;
                    })}
                  </div>
                </button>
              </div>
            )}

            <div style={{ backgroundColor: cardBg, borderRadius: "20px", overflow: "hidden" }}>
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

            <div style={{ backgroundColor: cardBg, borderRadius: "20px", overflow: "hidden" }}>
              <div style={{ padding: "14px 16px 4px", color: "#F5A623", fontSize: "10px", fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase" }}>Coordonnées</div>
              <div style={{ borderTop: `1px solid ${cardBord}`, margin: "10px 0 0" }}/>
              <Ligne label="Téléphone" valeur={formatPhone(user)} badge={{ texte: "VÉRIFIÉ", verifie: true }}/>
              <div style={{ borderTop: `1px solid ${cardBord}` }}/>
              {/* Email jamais vérifié dans Yelen aujourd'hui (aucun flux de
                  confirmation par lien/code) — badge honnête plutôt que
                  silencieux (retour Bryan 29/08/2026), même principe que
                  "VÉRIFIÉ" sur le téléphone. */}
              <Ligne label="Email" valeur={email || "Non renseigné"} badge={{ texte: "NON VÉRIFIÉ", verifie: false }}/>
              <div style={{ borderTop: `1px solid ${cardBord}` }}/>
              <Ligne label="Adresse" valeur={adresse || "Non renseignée"}/>
              <div style={{ borderTop: `1px solid ${cardBord}` }}/>
              <Ligne label="Ville" valeur={ville || "Non renseignée"}/>
            </div>

            {/* "Pourquoi ces informations ?" — remplace "Gérer mon compte"
                à cette position (retour Bryan 27/08/2026) : cet écran doit
                expliquer la valeur des données, pas gérer le compte.
                Déconnexion/Suppression déplacées vers /compte/parametres
                (section "Compte"), logique portée telle quelle, aucun
                comportement changé. Liens réels uniquement — pas de lien
                "en savoir plus" séparé créé faute de destination distincte
                de "Gérer mes préférences" (même écran /compte/confidentialite). */}
            <div style={{ backgroundColor: cardBg, borderRadius: "20px", padding: "18px 20px" }}>
              <div style={{ fontSize: "14px", fontWeight: 800, marginBottom: "10px", letterSpacing: "-0.2px" }}>Pourquoi ces informations ?</div>
              <p style={{ color: subText, fontSize: "12.5px", lineHeight: 1.6, margin: "0 0 12px" }}>
                Ces informations permettent à Yelen de mieux vous accompagner. Elles servent notamment à sécuriser votre compte, personnaliser votre expérience et vous proposer des services, établissements et contenus plus pertinents selon votre profil et vos besoins.
              </p>
              <p style={{ color: subText, fontSize: "12.5px", lineHeight: 1.6, margin: "0 0 16px" }}>
                Vos informations restent sous votre contrôle. Certaines informations peuvent être nécessaires pour accéder à des fonctionnalités spécifiques ou effectuer certaines démarches. Yelen n&apos;utilise que les informations nécessaires au fonctionnement des services concernés.
              </p>
              {/* Padding vertical sur chaque lien (au lieu d'un simple gap) —
                  agrandit la zone tactile réelle sans changer l'espacement
                  visuel perçu entre les 3 lignes. */}
              <div style={{ display: "flex", flexDirection: "column", margin: "-8px 0" }}>
                {[
                  { label: "Gérer mes préférences", href: "/compte/confidentialite" },
                  { label: "Politique de confidentialité", href: "/confidentialite" },
                  { label: "Conditions générales d'utilisation", href: "/cgu" },
                ].map((lien) => (
                  <button key={lien.href} type="button" onClick={() => router.push(lien.href)} className="tap" style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", padding: "8px 0", color: "#F5A623", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
                    {lien.label} <Ic.Chev/>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
