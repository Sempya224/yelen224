"use client";

// Onglet "Services" — expérience Hôtel V2 (chantier Services Hôtel V2,
// docs/ui/YELEN_HOTEL_SERVICES_V2_AUDIT.md, 20/08/2026). Composant
// SÉPARÉ de ServicesTab.tsx (jamais un branchement à l'intérieur) —
// rendu conditionnel par le parent (page.tsx, activite_principale_code
// === "hotellerie") sur le même tabKey="services", même patron que
// "Chambres" (Offre générale relabellée) déjà livré : aucun nouveau
// menu, aucune nouvelle TabKey/permission.
//
// Décisions verrouillées (audit, options recommandées validées) :
// - Pas de nouvelle table : paid_services étendu par 5 colonnes
//   nullables (migration 20260821000010), aucun changement de la
//   validation prix/durée existante (toujours obligatoires, comme pour
//   les 14 autres secteurs qui utilisent la même route).
// - Pas de nouvelle table de familles : `categorie` (texte libre déjà
//   existante) sert de famille, regroupement dynamique par valeur
//   réellement saisie — jamais une liste figée affichée par défaut.
// - Demandes suivies (statut Envoyée→Terminée) explicitement reportées
//   (dépendance non résolue : Yelen ne sait pas déterminer qu'un
//   citoyen est "en séjour", voir audit §I) — cet écran ne gère que le
//   catalogue de prestations et leurs réservations existantes.
// - Seuls les types de prestation qui ont un prix réel sont proposés
//   ici (réservable/commandable/supplément/horaires limités) : "inclus"
//   et "sur demande sans tarif" nécessiteraient d'assouplir la
//   validation prix>0 partagée par tous les secteurs, non fait dans ce
//   lot (voir note de portée dans le rapport de livraison).
import { useState, useCallback, useEffect } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toUiTokens, toCardTokens } from "../theme";
import { YelenLoader } from "@/components/YelenLoader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { DEVISE_LABEL } from "@/lib/devise";
import { type Horaire, JOURS_SEMAINE, isOuvertNow } from "@/lib/horaires";
import { EQUIPEMENTS_CHAMBRE } from "@/lib/hotelEquipements";

// Horaires (retour Bryan 20/08/2026 : "pas du texte libre, utilise celle
// du système") — même type Horaire[] que institutions.horaires
// (lib/horaires.ts), même widget de saisie que Profil Entreprise
// (ProfilEntrepriseTab.tsx), jamais un champ texte réinventé. Ordre
// Lundi→Dimanche pour l'affichage (JOURS_SEMAINE commence Dimanche).
const JOURS_AFFICHAGE = [...JOURS_SEMAINE.slice(1), JOURS_SEMAINE[0]];
const HORAIRES_DEFAUT: Horaire[] = JOURS_AFFICHAGE.map(jour => ({ jour, ouvert: true, debut: "08:00", fin: "20:00" }));

type TypePrestation = "reservable" | "commandable" | "supplement" | "horaires_limites";

const TYPE_OPTIONS: { value: TypePrestation; label: string; apercu: string; color: "blue" | "green" | "orange" | "purple" }[] = [
  { value: "reservable",      label: "Réservable",        apercu: "Le client verra un bouton « Réserver ».",              color: "blue" },
  { value: "commandable",     label: "Commandable",       apercu: "Le client verra un bouton « Commander ».",             color: "green" },
  { value: "supplement",      label: "Avec supplément",   apercu: "Ajouté à une réservation existante, avec un tarif additionnel.", color: "orange" },
  { value: "horaires_limites",label: "Horaires limités",  apercu: "Disponible seulement sur certains créneaux — le client verra les horaires.", color: "purple" },
];

const UNITE_PRIX_OPTIONS = ["par nuit", "par personne", "par usage", "forfait"];

type PaidService = {
  id: string; institution_id: string; nom: string; prix: number; duree_minutes: number;
  description: string | null; categorie: string | null; is_active: boolean; created_at: string;
  type_prestation: TypePrestation | null; unite_prix: string | null; horaires: Horaire[] | null; localisation: string | null;
  est_chambre: boolean; photos: string[]; video_url: string | null; video_duree_secondes: number | null;
  equipements_chambre: string[] | null;
  // Chambres & prestations V2 (17/09/2026) — nombre d'unités physiques de
  // ce type de chambre. Jamais une disponibilité : aucun moteur de
  // réservation par dates n'existe (voir migration
  // 20260917000001_paid_services_nombre_unites.sql), donc "combien sont
  // libres aujourd'hui" resterait une donnée inventée. NULL sur les
  // chambres créées avant ce lot → traité comme 1 côté affichage,
  // jamais réécrit en base rétroactivement.
  nombre_unites: number | null;
};

const MAX_PHOTOS_CHAMBRE = 5;
const MAX_VIDEO_SECONDES = 60;

// Lit la durée réelle d'une vidéo avant upload (retour Bryan 20/08/2026 :
// "max 60s") — seule vérification possible sans outil serveur (ffprobe),
// voir commentaire de la migration 20260821000010 et de la route
// api/institution/services/media/route.ts.
function lireDureeVideo(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => { URL.revokeObjectURL(video.src); resolve(video.duration); };
    video.onerror = () => { URL.revokeObjectURL(video.src); reject(new Error("Impossible de lire cette vidéo")); };
    video.src = URL.createObjectURL(file);
  });
}
type PaidBooking = {
  id: string; service_id: string; date_rdv: string; heure_rdv: string; confirmation_code: string; statut: string; created_at: string;
  citoyen_nom?: string;
};

function formatPrix(p: number): string { return p.toLocaleString("fr-FR") + " " + DEVISE_LABEL; }
function formatDate(iso: string): string { return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }); }

function typeInfo(t: TypePrestation | null) { return TYPE_OPTIONS.find(o => o.value === t) ?? null; }

function Toast({ msg, color, onDismiss }: { msg: string; color: string; onDismiss: () => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  useEffect(() => { const t = setTimeout(onDismiss, 3500); return () => clearTimeout(t); }, [onDismiss]);
  return (
    <div onClick={onDismiss} style={{ position: "fixed", top: "70px", left: "50%", transform: "translateX(-50%)", zIndex: 999, backgroundColor: C.bgCard2, border: `1px solid ${color}40`, borderLeft: `3px solid ${color}`, borderRadius: "14px", padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px", boxShadow: "0 8px 32px rgba(0,0,0,0.4)", animation: "fadeUp 0.22s ease", cursor: "pointer", minWidth: "220px", maxWidth: "calc(100vw - 32px)" }}>
      <div style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: color, flexShrink: 0 }}/>
      <span style={{ color: C.t1, fontSize: "12px", fontWeight: "700", flex: 1 }}>{msg}</span>
    </div>
  );
}

// Chambres (retour Bryan 20/08/2026 : "l'ajout des chambres est
// obligatoire, avec image, ce n'est pas pareil que les services") —
// formulaire dédié, séparé des prestations, tous champs obligatoires y
// compris la photo. Stockées dans paid_services (est_chambre=true) pour
// avoir un vrai prix + une vraie photo, contrairement à l'ancienne
// "Chambres" (Offre générale, institutions.services, sans photo).
function ChambreForm({ onSave, onCancel, saving, initial }: {
  onSave: (d: { nom: string; description: string; prix: number; photos: string[]; video_url: string | null; video_duree_secondes: number | null; equipements_chambre: string[]; nombre_unites: number }) => Promise<void>;
  onCancel: () => void; saving: boolean; initial?: PaidService | null;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [nom, setNom] = useState(initial?.nom ?? "");
  const [desc, setDesc] = useState(initial?.description ?? "");
  const [prix, setPrix] = useState(initial ? String(initial.prix) : "");
  const [nombreUnites, setNombreUnites] = useState(String(initial?.nombre_unites ?? 1));
  const [photos, setPhotos] = useState<string[]>(initial?.photos ?? []);
  const [videoUrl, setVideoUrl] = useState(initial?.video_url ?? "");
  const [videoDuree, setVideoDuree] = useState<number | null>(initial?.video_duree_secondes ?? null);
  const [equipements, setEquipements] = useState<string[]>(initial?.equipements_chambre ?? []);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [err, setErr] = useState("");
  const isEdit = !!initial;

  const toggleEquipement = (code: string) => {
    setEquipements(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  };

  async function handlePhoto(file: File) {
    setErr("");
    setUploadingPhoto(true);
    const form = new FormData();
    form.append("kind", "photo");
    form.append("file", file);
    const res = await fetch("/api/institution/services/media", { method: "POST", body: form });
    const j = await res.json().catch(() => null);
    setUploadingPhoto(false);
    if (!res.ok) { setErr(j?.error || "Échec de l'envoi de la photo"); return; }
    setPhotos(p => [...p, j.url].slice(0, MAX_PHOTOS_CHAMBRE));
  }

  async function handleVideo(file: File) {
    setErr("");
    let duree: number;
    try {
      duree = await lireDureeVideo(file);
    } catch {
      setErr("Impossible de lire cette vidéo — réessayez avec un autre fichier.");
      return;
    }
    if (duree > MAX_VIDEO_SECONDES) {
      setErr(`Cette vidéo dure ${Math.round(duree)}s — le maximum est de ${MAX_VIDEO_SECONDES}s.`);
      return;
    }
    setUploadingVideo(true);
    const form = new FormData();
    form.append("kind", "video");
    form.append("file", file);
    form.append("duree_secondes", String(Math.round(duree)));
    const res = await fetch("/api/institution/services/media", { method: "POST", body: form });
    const j = await res.json().catch(() => null);
    setUploadingVideo(false);
    if (!res.ok) { setErr(j?.error || "Échec de l'envoi de la vidéo"); return; }
    setVideoUrl(j.url);
    setVideoDuree(Math.round(duree));
  }

  async function submit() {
    setErr("");
    if (!nom.trim()) { setErr("Le nom du type de chambre est obligatoire"); return; }
    if (!nombreUnites || isNaN(+nombreUnites) || +nombreUnites <= 0) { setErr("Entrez un nombre de chambres valide"); return; }
    if (!prix || isNaN(+prix) || +prix <= 0) { setErr(`Entrez un prix par nuit valide en ${DEVISE_LABEL}`); return; }
    if (!desc.trim()) { setErr("La description est obligatoire"); return; }
    if (photos.length === 0) { setErr("Au moins une photo est obligatoire"); return; }
    await onSave({ nom: nom.trim(), description: desc.trim(), prix: +prix, photos, video_url: videoUrl || null, video_duree_secondes: videoUrl ? videoDuree : null, equipements_chambre: equipements, nombre_unites: Math.round(+nombreUnites) });
  }

  const inputStyle: React.CSSProperties = { width: "100%", backgroundColor: C.bg3, border: `1.5px solid ${C.border}`, borderRadius: "12px", padding: "12px 14px", fontSize: "14px", color: C.t1, fontFamily: "inherit" };
  const labelStyle: React.CSSProperties = { display: "block", color: C.t2, fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "6px" };

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div>
          <label style={labelStyle}>Photos * <span style={{ fontWeight: "500", textTransform: "none", fontSize: "10px" }}>({photos.length}/{MAX_PHOTOS_CHAMBRE})</span></label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
            {photos.map((url, i) => (
              <div key={url} style={{ position: "relative", borderRadius: "12px", overflow: "hidden", aspectRatio: "1/1" }}>
                {/* IMG-EXCEPTION: reason=galerie de vignettes en cours d'édition, URLs Storage publiques déjà stables | reviewed=2026-08-20 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Photo ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}/>
                <button onClick={() => setPhotos(p => p.filter((_, idx) => idx !== i))} className="tap" style={{ position: "absolute", top: "5px", right: "5px", width: "22px", height: "22px", borderRadius: "50%", backgroundColor: "rgba(0,0,0,0.6)", border: "none", color: "#fff", cursor: "pointer", fontSize: "11px" }}>✕</button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS_CHAMBRE && (
              <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", aspectRatio: "1/1", border: `1.5px dashed ${C.border2}`, borderRadius: "12px", cursor: uploadingPhoto ? "wait" : "pointer", backgroundColor: C.bg3 }}>
                {uploadingPhoto ? <YelenLoader size={18}/> : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    <span style={{ color: C.t3, fontSize: "10px", fontWeight: "700" }}>Ajouter</span>
                  </>
                )}
                <input type="file" accept="image/*" style={{ display: "none" }} disabled={uploadingPhoto} onChange={e => { const f = e.target.files?.[0]; if (f) handlePhoto(f); e.target.value = ""; }}/>
              </label>
            )}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Vidéo <span style={{ fontWeight: "500", textTransform: "none", fontSize: "10px" }}>(facultatif, {MAX_VIDEO_SECONDES}s max)</span></label>
          {videoUrl ? (
            <div style={{ position: "relative", borderRadius: "14px", overflow: "hidden" }}>
              <video src={videoUrl} controls style={{ width: "100%", maxHeight: "200px", display: "block", backgroundColor: "#000" }}/>
              <button onClick={() => { setVideoUrl(""); setVideoDuree(null); }} className="tap" style={{ position: "absolute", top: "8px", right: "8px", width: "28px", height: "28px", borderRadius: "50%", backgroundColor: "rgba(0,0,0,0.6)", border: "none", color: "#fff", cursor: "pointer" }}>✕</button>
            </div>
          ) : (
            <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px", height: "90px", border: `1.5px dashed ${C.border2}`, borderRadius: "14px", cursor: uploadingVideo ? "wait" : "pointer", backgroundColor: C.bg3 }}>
              {uploadingVideo ? <YelenLoader size={18}/> : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                  <span style={{ color: C.t3, fontSize: "12px", fontWeight: "700" }}>Ajouter une vidéo</span>
                </>
              )}
              <input type="file" accept="video/mp4,video/webm,video/quicktime" style={{ display: "none" }} disabled={uploadingVideo} onChange={e => { const f = e.target.files?.[0]; if (f) handleVideo(f); e.target.value = ""; }}/>
            </label>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "10px" }}>
          <div>
            <label style={labelStyle}>Nom du type de chambre *</label>
            <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Ex : Chambre Deluxe, Suite familiale…" style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Nombre de chambres *</label>
            <input type="number" min={1} value={nombreUnites} onChange={e => setNombreUnites(e.target.value)} placeholder="4" style={inputStyle}/>
          </div>
        </div>
        <p style={{ color: C.t3, fontSize: "11px", lineHeight: 1.5, margin: "-6px 0 0" }}>Toutes les chambres de ce type partagent le même prix, la même description et les mêmes équipements.</p>
        <div>
          <label style={labelStyle}>Prix par nuit ({DEVISE_LABEL}) *</label>
          <input type="number" value={prix} onChange={e => setPrix(e.target.value)} placeholder="500000" style={inputStyle}/>
        </div>
        <div>
          <label style={labelStyle}>Description *</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Superficie, literie…" rows={3} style={{ ...inputStyle, resize: "none", lineHeight: 1.65 }}/>
        </div>

        <div>
          <label style={labelStyle}>Équipements de cette chambre <span style={{ fontWeight: "500", textTransform: "none", fontSize: "10px" }}>(facultatif — distinct des équipements de l&apos;établissement)</span></label>
          <div style={{ backgroundColor: C.bg3, border: `1.5px solid ${C.border}`, borderRadius: "12px", padding: "12px", display: "flex", flexDirection: "column", gap: "14px" }}>
            {EQUIPEMENTS_CHAMBRE.map(cat => (
              <div key={cat.id}>
                <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "7px" }}>{cat.label}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
                  {cat.items.map(item => {
                    const checked = equipements.includes(item.code);
                    return (
                      <button key={item.code} type="button" onClick={() => toggleEquipement(item.code)} className="tap" style={{ display: "flex", alignItems: "center", gap: "6px", backgroundColor: checked ? `${C.gold}15` : C.bgCard, border: `1.5px solid ${checked ? C.gold + "50" : C.border2}`, borderRadius: "20px", padding: "7px 12px", cursor: "pointer" }}>
                        {item.icon(checked ? C.gold : C.t3)}
                        <span style={{ color: checked ? C.gold : C.t2, fontSize: "11.5px", fontWeight: checked ? "700" : "500" }}>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {err && (
          <div style={{ backgroundColor: C.redL, color: C.red, fontSize: "12px", fontWeight: "700", padding: "10px 14px", borderRadius: "10px" }}>{err}</div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.7fr", gap: "10px" }}>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={onCancel}>Annuler</Button>
          <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" disabled={uploadingPhoto || uploadingVideo} loading={saving} onClick={submit}>
            {isEdit ? "Enregistrer les modifications" : "Créer la chambre"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Pop-up large et centré (retour Bryan 20/08/2026, correction : "plein
// écran" voulait dire "tiré horizontalement", pas une prise de contrôle
// de tout l'écran — référence donnée : le dialogue "Create scheduled
// task" de Claude.ai, un modal centré avec fond estompé derrière, large,
// titre + croix en haut du panneau, PAS une page pleine sans backdrop).
// Mobile : feuille qui glisse depuis le bas (comme le reste du produit).
// PC (≥900px) : modal centré, large (820px, contre 560/640px avant —
// c'était trop étroit pour un grand écran). Les deux pop-ups de cet
// écran (Chambres/Prestations) partagent ce même patron, strictement
// identique.
function FormOverlay({ title, onCancel, children }: { title: string; onCancel: () => void; children: React.ReactNode }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  return (
    <div className="svch-overlay" style={{ position: "fixed", inset: 0, zIndex: 900, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }} onClick={onCancel}>
      <style>{`@media(min-width:900px){.svch-overlay{align-items:center!important;padding:24px!important}.svch-panel{max-width:820px!important;border-radius:20px!important;max-height:88svh!important}}`}</style>
      <div onClick={e => e.stopPropagation()} className="svch-panel" style={{ position: "relative", backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", width: "100%", maxWidth: "560px", maxHeight: "92svh", overflowY: "auto", border: `1px solid ${C.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease", display: "flex", flexDirection: "column" }}>
        <div style={{ position: "sticky", top: 0, zIndex: 1, backgroundColor: C.bgCard, borderBottom: `1px solid ${C.border}`, padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <h2 style={{ color: C.t1, fontSize: "16px", fontWeight: 800, margin: 0 }}>{title}</h2>
          <button onClick={onCancel} aria-label="Fermer" className="tap" style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.t2, flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ padding: "22px 22px 32px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function ChambreFormSheet({ target, onSave, onCancel, saving }: {
  target: "new" | PaidService; onSave: (d: { nom: string; description: string; prix: number; photos: string[]; video_url: string | null; video_duree_secondes: number | null; equipements_chambre: string[]; nombre_unites: number }) => Promise<void>;
  onCancel: () => void; saving: boolean;
}) {
  return (
    <FormOverlay title={target === "new" ? "Nouvelle chambre" : "Modifier la chambre"} onCancel={onCancel}>
      <ChambreForm onSave={onSave} onCancel={onCancel} saving={saving} initial={target === "new" ? null : target}/>
    </FormOverlay>
  );
}

function ChambreCard({ chambre, resaCount, onEdit, onToggleActive, onDelete, toggling }: {
  chambre: PaidService; resaCount: number; onEdit: () => void; onToggleActive: () => void; onDelete: () => void; toggling: boolean;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  return (
    <Card tokens={toCardTokens(C)} noPadding style={{ border: `1.5px solid ${chambre.is_active ? C.border2 : C.border}`, opacity: chambre.is_active ? 1 : 0.6 }}>
      {chambre.photos.length > 0 && (
        <div style={{ position: "relative" }}>
          {/* IMG-EXCEPTION: reason=galerie de cartes dynamique, URL Storage publique stable, pas de <Image> pour éviter le layout shift dans une grille auto-fill | reviewed=2026-08-20 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={chambre.photos[0]} alt={chambre.nom} style={{ width: "100%", height: "140px", objectFit: "cover", display: "block" }}/>
          <div style={{ position: "absolute", bottom: "8px", right: "8px", display: "flex", gap: "5px" }}>
            {chambre.photos.length > 1 && <span style={{ backgroundColor: "rgba(0,0,0,0.65)", color: "#fff", fontSize: "10px", fontWeight: "800", padding: "3px 8px", borderRadius: "20px" }}>📷 {chambre.photos.length}</span>}
            {chambre.video_url && <span style={{ backgroundColor: "rgba(0,0,0,0.65)", color: "#fff", fontSize: "10px", fontWeight: "800", padding: "3px 8px", borderRadius: "20px" }}>🎥</span>}
          </div>
        </div>
      )}
      <div style={{ padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px", marginBottom: "4px" }}>
          <div style={{ color: C.t1, fontSize: "14.5px", fontWeight: "800" }}>{chambre.nom}</div>
          <div onClick={onToggleActive} className="tap" style={{ width: "40px", height: "23px", borderRadius: "13px", backgroundColor: chambre.is_active ? C.gold : C.bg3, position: "relative", cursor: "pointer", flexShrink: 0, opacity: toggling ? 0.5 : 1, transition: "background-color 0.3s" }}>
            <div style={{ position: "absolute", top: "3px", left: chambre.is_active ? "20px" : "3px", width: "17px", height: "17px", borderRadius: "50%", backgroundColor: chambre.is_active ? "#000" : C.t3, transition: "left 0.25s ease" }}/>
          </div>
        </div>
        <div style={{ color: C.t3, fontSize: "11.5px", fontWeight: "700", marginBottom: "6px" }}>{chambre.nombre_unites ?? 1} chambre{(chambre.nombre_unites ?? 1) > 1 ? "s" : ""} de ce type</div>
        <div style={{ color: C.gold, fontSize: "13px", fontWeight: "800", marginBottom: "6px" }}>{formatPrix(chambre.prix)} / nuit</div>
        {chambre.description && <div style={{ color: C.t2, fontSize: "12px", lineHeight: 1.55, marginBottom: "8px" }}>{chambre.description}</div>}
        {!chambre.is_active && <div style={{ color: C.t3, fontSize: "10.5px", fontStyle: "italic", marginBottom: "8px" }}>Non visible sur votre fiche publique — historique conservé.</div>}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
          <span style={{ color: C.t3, fontSize: "11px", fontWeight: "700" }}>{resaCount} réservation{resaCount > 1 ? "s" : ""}</span>
          <div style={{ display: "flex", gap: "6px" }}>
            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={onEdit}>Modifier</Button>
            <Button tokens={toUiTokens(C)} className="tap" variant="danger-ghost" size="sm" onClick={onDelete}>Supprimer</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function PrestationForm({ onSave, onCancel, saving, initial, familles }: {
  onSave: (d: { nom: string; prix: number; duree_minutes: number; description: string; categorie: string; type_prestation: TypePrestation; unite_prix: string | null; horaires: Horaire[]; localisation: string }) => Promise<void>;
  onCancel: () => void; saving: boolean; initial?: PaidService | null; familles: string[];
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [nom, setNom] = useState(initial?.nom ?? "");
  const [famille, setFamille] = useState(initial?.categorie ?? "");
  const [type, setType] = useState<TypePrestation>(initial?.type_prestation ?? "reservable");
  const [prix, setPrix] = useState(initial ? String(initial.prix) : "");
  const [unitePrix, setUnitePrix] = useState(initial?.unite_prix ?? "");
  const [duree, setDuree] = useState(initial ? String(initial.duree_minutes) : "30");
  const [horaires, setHoraires] = useState<Horaire[]>(initial?.horaires && initial.horaires.length > 0 ? initial.horaires : HORAIRES_DEFAUT);
  const [localisation, setLocalisation] = useState(initial?.localisation ?? "");
  const [desc, setDesc] = useState(initial?.description ?? "");
  const [err, setErr] = useState("");
  const isEdit = !!initial;

  const updateHoraire = (idx: number, field: keyof Horaire, value: string | boolean) => {
    setHoraires(h => h.map((x, i) => i === idx ? { ...x, [field]: value } : x));
  };

  // Tous les champs sont obligatoires dans ce pop-up (retour Bryan
  // 20/08/2026 : "tous doivent être obligatoire pas de facultatif") —
  // ne concerne que ce formulaire, aucune contrainte NOT NULL ajoutée en
  // base (colonnes restent nullable, paid_services étant partagée par
  // les 14 autres secteurs qui ne renseignent jamais ces champs).
  async function submit() {
    setErr("");
    if (!nom.trim()) { setErr("Le nom est obligatoire"); return; }
    if (!famille.trim()) { setErr("La famille est obligatoire (ex : Restauration, Bien-être, Confort de la chambre…)"); return; }
    if (!prix || isNaN(+prix) || +prix <= 0) { setErr(`Entrez un prix valide en ${DEVISE_LABEL}`); return; }
    if (!unitePrix) { setErr("L'unité de prix est obligatoire"); return; }
    if (!duree || isNaN(+duree) || +duree <= 0) { setErr("Entrez une durée estimée valide en minutes"); return; }
    if (!horaires.some(h => h.ouvert)) { setErr("Les horaires sont obligatoires — ouvrez au moins un jour"); return; }
    if (!localisation.trim()) { setErr("La localisation est obligatoire"); return; }
    if (!desc.trim()) { setErr("La description est obligatoire"); return; }
    await onSave({ nom: nom.trim(), prix: +prix, duree_minutes: +duree, description: desc.trim(), categorie: famille.trim(), type_prestation: type, unite_prix: unitePrix.trim(), horaires, localisation: localisation.trim() });
  }

  const inputStyle: React.CSSProperties = { width: "100%", backgroundColor: C.bg3, border: `1.5px solid ${C.border}`, borderRadius: "12px", padding: "12px 14px", fontSize: "14px", color: C.t1, fontFamily: "inherit" };
  const labelStyle: React.CSSProperties = { display: "block", color: C.t2, fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "6px" };
  const aperçu = typeInfo(type);

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div>
          <label style={labelStyle}>Nom de la prestation *</label>
          <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Ex : Massage relaxant, Transfert aéroport, Petit-déjeuner buffet…" style={inputStyle}/>
        </div>
        <div>
          <label style={labelStyle}>Famille *</label>
          <input value={famille} onChange={e => setFamille(e.target.value)} placeholder="Ex : Restauration, Bien-être & loisirs, Confort de la chambre…" style={inputStyle} list="familles-existantes"/>
          <datalist id="familles-existantes">{familles.map(f => <option key={f} value={f}/>)}</datalist>
        </div>
        <div>
          <label style={labelStyle}>Type de prestation *</label>
          <select value={type} onChange={e => setType(e.target.value as TypePrestation)} style={{ ...inputStyle, cursor: "pointer" }}>
            {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {aperçu && <div style={{ color: C.t3, fontSize: "11px", marginTop: "6px", lineHeight: 1.5 }}>{aperçu.apercu}</div>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div>
            <label style={labelStyle}>Prix ({DEVISE_LABEL}) *</label>
            <input type="number" value={prix} onChange={e => setPrix(e.target.value)} placeholder="50000" style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Unité *</label>
            <select value={unitePrix} onChange={e => setUnitePrix(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
              <option value="" disabled>Choisir…</option>
              {UNITE_PRIX_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div>
            <label style={labelStyle}>Durée estimée (min) *</label>
            <input type="number" value={duree} onChange={e => setDuree(e.target.value)} placeholder="30" style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Localisation *</label>
            <input value={localisation} onChange={e => setLocalisation(e.target.value)} placeholder="Ex : Rez-de-chaussée" style={inputStyle}/>
          </div>
        </div>
        <div>
          <label style={labelStyle}>Horaires *</label>
          {/* Même widget que Profil Entreprise (ProfilEntrepriseTab.tsx)
              — jour par jour, ouvert/fermé + début/fin, jamais un champ
              texte réinventé (retour Bryan 20/08/2026). */}
          <div style={{ backgroundColor: C.bg3, border: `1.5px solid ${C.border}`, borderRadius: "12px", padding: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
            {horaires.map((h, i) => (
              <div key={h.jour} style={{ display: "grid", gridTemplateColumns: "94px 1fr", gap: "8px", alignItems: "center", padding: "6px 6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div onClick={() => updateHoraire(i, "ouvert", !h.ouvert)} className="tap" style={{ width: "30px", height: "18px", borderRadius: "9px", backgroundColor: h.ouvert ? C.gold : C.bg, position: "relative", cursor: "pointer", flexShrink: 0 }}>
                    <div style={{ position: "absolute", top: "2px", left: h.ouvert ? "14px" : "2px", width: "14px", height: "14px", borderRadius: "50%", backgroundColor: h.ouvert ? "#000" : C.t3, transition: "left 0.15s" }}/>
                  </div>
                  <span style={{ color: h.ouvert ? C.t1 : C.t3, fontSize: "11.5px", fontWeight: "700" }}>{h.jour}</span>
                </div>
                {h.ouvert ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <input type="time" value={h.debut} onChange={e => updateHoraire(i, "debut", e.target.value)} style={{ ...inputStyle, padding: "6px 8px", fontSize: "12px" }}/>
                    <span style={{ color: C.t3, fontSize: "11px" }}>→</span>
                    <input type="time" value={h.fin} onChange={e => updateHoraire(i, "fin", e.target.value)} style={{ ...inputStyle, padding: "6px 8px", fontSize: "12px" }}/>
                  </div>
                ) : (
                  <span style={{ color: C.t3, fontSize: "11.5px", fontStyle: "italic" }}>Fermé</span>
                )}
              </div>
            ))}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Description *</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Décrivez brièvement cette prestation pour vos clients…" rows={3} style={{ ...inputStyle, resize: "none", lineHeight: 1.65 }}/>
        </div>

        {err && (
          <div style={{ backgroundColor: C.redL, color: C.red, fontSize: "12px", fontWeight: "700", padding: "10px 14px", borderRadius: "10px" }}>{err}</div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.7fr", gap: "10px" }}>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={onCancel}>Annuler</Button>
          <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" loading={saving} onClick={submit}>
            {isEdit ? "Enregistrer les modifications" : "Créer la prestation"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PrestationFormSheet({ target, onSave, onCancel, saving, familles }: {
  target: "new" | PaidService; onSave: (d: { nom: string; prix: number; duree_minutes: number; description: string; categorie: string; type_prestation: TypePrestation; unite_prix: string | null; horaires: Horaire[]; localisation: string }) => Promise<void>;
  onCancel: () => void; saving: boolean; familles: string[];
}) {
  return (
    <FormOverlay title={target === "new" ? "Nouvelle prestation" : "Modifier la prestation"} onCancel={onCancel}>
      <PrestationForm onSave={onSave} onCancel={onCancel} saving={saving} initial={target === "new" ? null : target} familles={familles}/>
    </FormOverlay>
  );
}

function PrestationCard({ service, resaCount, onEdit, onToggleActive, onDelete, toggling }: {
  service: PaidService; resaCount: number; onEdit: () => void; onToggleActive: () => void; onDelete: () => void; toggling: boolean;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const ti = typeInfo(service.type_prestation);
  const badgeColor = ti ? { blue: C.blue, green: C.green, orange: C.orange, purple: C.purple }[ti.color] : C.t3;
  const badgeBg = ti ? { blue: C.blueL, green: C.greenL, orange: C.orangeL, purple: C.purpleL }[ti.color] : C.bg3;

  return (
    <Card tokens={toCardTokens(C)} padding="14px 16px" style={{ border: `1.5px solid ${service.is_active ? C.border2 : C.border}`, opacity: service.is_active ? 1 : 0.6 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px", marginBottom: "8px" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: C.t1, fontSize: "14.5px", fontWeight: "800" }}>{service.nom}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginTop: "4px" }}>
            {ti && <span style={{ backgroundColor: badgeBg, color: badgeColor, fontSize: "10px", fontWeight: "800", padding: "3px 9px", borderRadius: "20px" }}>{ti.label}</span>}
            <span style={{ color: C.gold, fontSize: "13px", fontWeight: "800" }}>{formatPrix(service.prix)}{service.unite_prix ? ` / ${service.unite_prix}` : ""}</span>
          </div>
        </div>
        <div onClick={onToggleActive} className="tap" style={{ width: "40px", height: "23px", borderRadius: "13px", backgroundColor: service.is_active ? C.gold : C.bg3, position: "relative", cursor: "pointer", flexShrink: 0, opacity: toggling ? 0.5 : 1, transition: "background-color 0.3s" }}>
          <div style={{ position: "absolute", top: "3px", left: service.is_active ? "20px" : "3px", width: "17px", height: "17px", borderRadius: "50%", backgroundColor: service.is_active ? "#000" : C.t3, transition: "left 0.25s ease" }}/>
        </div>
      </div>
      {service.description && <div style={{ color: C.t2, fontSize: "12px", lineHeight: 1.55, marginBottom: "8px" }}>{service.description}</div>}
      {(service.horaires && service.horaires.length > 0 || service.localisation) && (
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "8px" }}>
          {service.horaires && service.horaires.length > 0 && (() => {
            const { ouvert, horaire } = isOuvertNow(service.horaires);
            return (
              <span style={{ color: ouvert ? C.green : C.t3, fontSize: "11px", fontWeight: "600" }}>
                🕒 {ouvert ? "Ouvert maintenant" : "Fermé maintenant"}{horaire?.ouvert ? ` · ${horaire.debut}-${horaire.fin}` : ""}
              </span>
            );
          })()}
          {service.localisation && <span style={{ color: C.t3, fontSize: "11px", fontWeight: "600" }}>📍 {service.localisation}</span>}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginTop: "6px" }}>
        <span style={{ color: C.t3, fontSize: "11px", fontWeight: "700" }}>{resaCount} réservation{resaCount > 1 ? "s" : ""}</span>
        <div style={{ display: "flex", gap: "6px" }}>
          <button onClick={onEdit} className="tap" style={{ backgroundColor: C.bg3, border: `1.5px solid ${C.border2}`, color: C.t1, fontWeight: "700", fontSize: "11.5px", padding: "7px 12px", borderRadius: "9px", cursor: "pointer" }}>Modifier</button>
          <button onClick={onDelete} className="tap" style={{ backgroundColor: C.redL, border: `1px solid ${C.red}30`, color: C.red, fontWeight: "700", fontSize: "11.5px", padding: "7px 12px", borderRadius: "9px", cursor: "pointer" }}>Supprimer</button>
        </div>
      </div>
    </Card>
  );
}

export function ServicesHotelTab({}: { instId: string }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [services, setServices] = useState<PaidService[]>([]);
  const [bookings, setBookings] = useState<PaidBooking[]>([]);
  const [loading, setLoading] = useState(true);
  // Deux pop-ups distincts (retour Bryan 20/08/2026 : "l'ajout des
  // chambres n'est pas pareil que les services") — jamais le même
  // formulaire, même si les deux écrivent dans paid_services.
  const [prestationFormTarget, setPrestationFormTarget] = useState<"new" | PaidService | null>(null);
  const [chambreFormTarget, setChambreFormTarget] = useState<"new" | PaidService | null>(null);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; color: string } | null>(null);
  const [confirmSupprimer, setConfirmSupprimer] = useState<PaidService | null>(null);
  const [ajouterMenuOpen, setAjouterMenuOpen] = useState(false);
  // "Chambres" en premier : inventaire obligatoire d'un hôtel, avant les
  // prestations facultatives (retour Bryan 20/08/2026).
  const [subTab, setSubTab] = useState<"chambres" | "prestations" | "reservations">("chambres");

  function showToast(msg: string, color: string = C.green) { setToast({ msg, color }); }

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/institution/services");
      const j = res.ok ? await res.json().catch(() => null) : null;
      setServices(j?.services ?? []);
      setBookings(j?.bookings ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleSavePrestation(d: { nom: string; prix: number; duree_minutes: number; description: string; categorie: string; type_prestation: TypePrestation; unite_prix: string | null; horaires: Horaire[]; localisation: string }) {
    setSaving(true);
    const isEdit = prestationFormTarget && prestationFormTarget !== "new";
    const res = await fetch("/api/institution/services", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isEdit ? { id: (prestationFormTarget as PaidService).id, ...d, est_chambre: false } : { ...d, est_chambre: false }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) { showToast(j?.error || "Cette prestation n'a pas pu être enregistrée.", C.red); setSaving(false); return; }
    showToast(isEdit ? "Prestation mise à jour" : "Prestation créée avec succès", C.green);
    setPrestationFormTarget(null);
    await loadData();
    setSaving(false);
  }

  // Chambre : prix/nuit fixe (unite_prix figé, pas un choix — retour
  // Bryan) ; duree_minutes n'a pas de sens pour une chambre mais reste
  // une colonne obligatoire côté route (partagée par tous les secteurs,
  // jamais assouplie) — 1440 = 24h, valeur technique invisible du
  // formulaire.
  async function handleSaveChambre(d: { nom: string; description: string; prix: number; photos: string[]; video_url: string | null; video_duree_secondes: number | null; equipements_chambre: string[]; nombre_unites: number }) {
    setSaving(true);
    const isEdit = chambreFormTarget && chambreFormTarget !== "new";
    const body = { nom: d.nom, description: d.description, prix: d.prix, photos: d.photos, video_url: d.video_url, video_duree_secondes: d.video_duree_secondes, equipements_chambre: d.equipements_chambre, nombre_unites: d.nombre_unites, duree_minutes: 1440, unite_prix: "par nuit", est_chambre: true, categorie: null, type_prestation: null, horaires: null, localisation: null };
    const res = await fetch("/api/institution/services", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isEdit ? { id: (chambreFormTarget as PaidService).id, ...body } : body),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) { showToast(j?.error || "Cette chambre n'a pas pu être enregistrée.", C.red); setSaving(false); return; }
    showToast(isEdit ? "Chambre mise à jour" : "Chambre créée avec succès", C.green);
    setChambreFormTarget(null);
    await loadData();
    setSaving(false);
  }

  async function handleToggle(service: PaidService) {
    setToggling(service.id);
    const res = await fetch("/api/institution/services", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: service.id, is_active: !service.is_active }),
    });
    if (res.ok) {
      setServices(prev => prev.map(s => s.id === service.id ? { ...s, is_active: !s.is_active } : s));
      const label = service.est_chambre ? "Chambre" : "Prestation";
      showToast(service.is_active ? `${label} suspendue` : `${label} activée`, service.is_active ? C.orange : C.green);
    } else {
      showToast(`Le statut de ${service.est_chambre ? "cette chambre" : "cette prestation"} n'a pas pu être mis à jour.`, C.red);
    }
    setToggling(null);
  }

  async function handleDelete(service: PaidService) {
    const res = await fetch(`/api/institution/services?id=${service.id}`, { method: "DELETE" });
    setConfirmSupprimer(null);
    if (!res.ok) { showToast(`${service.est_chambre ? "Cette chambre" : "Cette prestation"} n'a pas pu être supprimée.`, C.red); return; }
    setServices(prev => prev.filter(s => s.id !== service.id));
    showToast(service.est_chambre ? "Chambre supprimée" : "Prestation supprimée", C.orange);
  }

  if (loading) return (
    <div style={{ padding: "60px 16px", display: "flex", justifyContent: "center" }}>
      <YelenLoader size={36}/>
    </div>
  );

  const chambres = services.filter(s => s.est_chambre);
  const prestations = services.filter(s => !s.est_chambre);
  const familles = Array.from(new Set(prestations.map(s => s.categorie).filter((c): c is string => !!c)));
  const groupes = familles.map(f => ({ famille: f, items: prestations.filter(s => s.categorie === f) }))
    .concat(prestations.some(s => !s.categorie) ? [{ famille: "Autres prestations", items: prestations.filter(s => !s.categorie) }] : []);
  const allBookingsSorted = [...bookings].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // KPI — uniquement des compteurs réellement calculables (17/09/2026).
  // Volontairement absent : "disponibles aujourd'hui"/"arrivées" — sans
  // moteur de réservation par dates, ce serait une donnée inventée (voir
  // en-tête de fichier).
  const totalUnites = chambres.reduce((s, c) => s + (c.nombre_unites ?? 1), 0);
  const prestationsActives = prestations.filter(p => p.is_active).length;
  const todayStr = new Date().toISOString().slice(0, 10);
  const reservationsAVenir = bookings.filter(b => b.date_rdv >= todayStr).length;
  const reservationsAujourdhui = bookings.filter(b => b.date_rdv === todayStr).length;

  return (
    <div style={{ padding: "16px", animation: "fadeUp 0.2s ease" }}>
      {toast && <Toast msg={toast.msg} color={toast.color} onDismiss={() => setToast(null)}/>}
      {chambreFormTarget && <ChambreFormSheet target={chambreFormTarget} onSave={handleSaveChambre} onCancel={() => setChambreFormTarget(null)} saving={saving}/>}
      {prestationFormTarget && <PrestationFormSheet target={prestationFormTarget} onSave={handleSavePrestation} onCancel={() => setPrestationFormTarget(null)} saving={saving} familles={familles}/>}
      <ConfirmModal
        open={!!confirmSupprimer}
        onClose={() => setConfirmSupprimer(null)}
        onConfirm={() => { if (confirmSupprimer) return handleDelete(confirmSupprimer); }}
        tokens={toUiTokens(C)}
        level={1}
        danger
        title={confirmSupprimer?.est_chambre ? "Supprimer cette chambre ?" : "Supprimer cette prestation ?"}
        description="Préférez Désactiver si vous voulez seulement la retirer temporairement de votre fiche publique."
        consequences={["Cette action supprime définitivement la fiche et son historique.", "Utilisez plutôt le bouton Activer/Désactiver pour la retirer sans rien perdre."]}
        reversible={false}
        confirmLabel="Supprimer"
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "18px", flexWrap: "wrap" }}>
        <div>
          <h1 className="yelen-h1" style={{ color: C.t1, marginBottom: "6px" }}>Chambres et services</h1>
          <p style={{ color: C.t2, fontSize: "13px", lineHeight: 1.5 }}>Gérez les chambres et prestations proposées par votre hôtel sur Yelen.</p>
        </div>
        <div style={{ position: "relative" }}>
          <Button
            tokens={toUiTokens(C)}
            className="tap"
            variant="primary"
            size="sm"
            style={{ whiteSpace: "nowrap" }}
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>}
            onClick={() => setAjouterMenuOpen(o => !o)}
          >
            Ajouter
          </Button>
          {ajouterMenuOpen && (
            <>
              <div onClick={() => setAjouterMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 500 }}/>
              <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 501, backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "12px", boxShadow: "0 12px 32px rgba(0,0,0,0.25)", minWidth: "200px", overflow: "hidden" }}>
                <button onClick={() => { setChambreFormTarget("new"); setAjouterMenuOpen(false); }} className="tap" style={{ width: "100%", textAlign: "left", padding: "11px 14px", background: "none", border: "none", color: C.t1, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>Ajouter une chambre</button>
                <div style={{ height: "1px", backgroundColor: C.border }}/>
                <button onClick={() => { setPrestationFormTarget("new"); setAjouterMenuOpen(false); }} className="tap" style={{ width: "100%", textAlign: "left", padding: "11px 14px", background: "none", border: "none", color: C.t1, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>Ajouter une prestation</button>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px", marginBottom: "18px" }}>
        <Card tokens={toCardTokens(C)} padding="14px 16px">
          <p style={{ color: C.t3, fontSize: "10.5px", fontWeight: "700", textTransform: "uppercase", margin: "0 0 6px" }}>Chambres</p>
          <p style={{ color: C.t1, fontSize: "22px", fontWeight: "800", margin: "0 0 4px", lineHeight: 1 }}>{totalUnites}</p>
          <p style={{ color: C.t3, fontSize: "10.5px", fontWeight: "700", margin: 0 }}>{chambres.length} type{chambres.length !== 1 ? "s" : ""} de chambre{chambres.length !== 1 ? "s" : ""}</p>
        </Card>
        <Card tokens={toCardTokens(C)} padding="14px 16px">
          <p style={{ color: C.t3, fontSize: "10.5px", fontWeight: "700", textTransform: "uppercase", margin: "0 0 6px" }}>Prestations actives</p>
          <p style={{ color: C.t1, fontSize: "22px", fontWeight: "800", margin: "0 0 4px", lineHeight: 1 }}>{prestationsActives}</p>
          <p style={{ color: C.t3, fontSize: "10.5px", fontWeight: "700", margin: 0 }}>{prestations.length} au total</p>
        </Card>
        <Card tokens={toCardTokens(C)} padding="14px 16px">
          <p style={{ color: C.t3, fontSize: "10.5px", fontWeight: "700", textTransform: "uppercase", margin: "0 0 6px" }}>Réservations à venir</p>
          <p style={{ color: C.t1, fontSize: "22px", fontWeight: "800", margin: "0 0 4px", lineHeight: 1 }}>{reservationsAVenir}</p>
          <p style={{ color: C.t3, fontSize: "10.5px", fontWeight: "700", margin: 0 }}>{reservationsAujourdhui} aujourd&apos;hui</p>
        </Card>
      </div>

      <div style={{ display: "flex", gap: "6px", marginBottom: "16px", backgroundColor: C.bgCard2, borderRadius: "18px", padding: "4px", border: `1px solid ${C.border}` }}>
        {([
          { key: "chambres", label: "Chambres", count: chambres.length },
          { key: "prestations", label: "Prestations", count: prestations.length },
          { key: "reservations", label: "Réservations", count: bookings.length },
        ] as { key: typeof subTab; label: string; count: number }[]).map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)} className="tap" style={{ flex: 1, backgroundColor: subTab === t.key ? C.bgCard : "transparent", border: subTab === t.key ? `1.5px solid ${C.gold}50` : "1.5px solid transparent", borderRadius: "14px", padding: "10px 8px", color: subTab === t.key ? C.gold : C.t3, fontSize: "12px", fontWeight: subTab === t.key ? "800" : "600", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
            {t.label}
            {t.count > 0 && <span style={{ backgroundColor: subTab === t.key ? C.gold : C.border2, color: subTab === t.key ? "#000" : C.t2, fontSize: "9px", fontWeight: "800", padding: "2px 7px", borderRadius: "20px" }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {subTab === "chambres" && (
        chambres.length === 0 ? (
          <Card tokens={toCardTokens(C)} padding="44px 24px" style={{ textAlign: "center" }}>
            <div style={{ width: "60px", height: "60px", borderRadius: "18px", background: `${C.gold}15`, border: `1.5px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round"><path d="M3 20v-8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8"/><path d="M3 18h18"/><path d="M5 10V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"/></svg>
            </div>
            <div style={{ color: C.t1, fontSize: "16px", fontWeight: "800", marginBottom: "8px" }}>Aucune chambre configurée</div>
            <div style={{ color: C.t3, fontSize: "13px", lineHeight: 1.65, marginBottom: "20px" }}>Ajoutez vos chambres avec photo et prix pour qu&apos;elles apparaissent sur votre fiche publique.</div>
            <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" style={{ padding: "0 28px" }} onClick={() => setChambreFormTarget("new")}>Ajouter ma première chambre</Button>
          </Card>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "12px" }}>
            {chambres.map(c => (
              <ChambreCard key={c.id} chambre={c} resaCount={bookings.filter(b => b.service_id === c.id).length}
                onEdit={() => setChambreFormTarget(c)} onToggleActive={() => handleToggle(c)} onDelete={() => setConfirmSupprimer(c)} toggling={toggling === c.id}/>
            ))}
          </div>
        )
      )}

      {subTab === "prestations" && (
        prestations.length === 0 ? (
          <Card tokens={toCardTokens(C)} padding="44px 24px" style={{ textAlign: "center" }}>
            <div style={{ width: "60px", height: "60px", borderRadius: "18px", background: `${C.gold}15`, border: `1.5px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round"><path d="M6 2l1.5 5M18 2l-1.5 5M3 7h18l-1.4 13a2 2 0 0 1-2 2H6.4a2 2 0 0 1-2-2z"/></svg>
            </div>
            <div style={{ color: C.t1, fontSize: "16px", fontWeight: "800", marginBottom: "8px" }}>Aucune prestation configurée</div>
            <div style={{ color: C.t3, fontSize: "13px", lineHeight: 1.65, marginBottom: "20px" }}>Room service, spa, transfert aéroport, blanchisserie… Ajoutez vos prestations pour qu&apos;elles apparaissent sur votre fiche.</div>
            <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" style={{ padding: "0 28px" }} onClick={() => setPrestationFormTarget("new")}>Ajouter ma première prestation</Button>
          </Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
            {groupes.map(g => (
              <div key={g.famille}>
                <div style={{ color: C.t3, fontSize: "11px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "10px" }}>{g.famille} ({g.items.length})</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "10px" }}>
                  {g.items.map(s => (
                    <PrestationCard key={s.id} service={s} resaCount={bookings.filter(b => b.service_id === s.id).length}
                      onEdit={() => setPrestationFormTarget(s)} onToggleActive={() => handleToggle(s)} onDelete={() => setConfirmSupprimer(s)} toggling={toggling === s.id}/>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {subTab === "reservations" && (
        allBookingsSorted.length === 0 ? (
          <Card tokens={toCardTokens(C)} padding="44px 24px" style={{ textAlign: "center" }}>
            <div style={{ color: C.t1, fontSize: "16px", fontWeight: "800", marginBottom: "8px" }}>Aucune réservation</div>
            <div style={{ color: C.t3, fontSize: "13px", lineHeight: 1.65 }}>Les réservations de vos prestations apparaîtront ici avec leur code Yelen.</div>
          </Card>
        ) : (
          <Card tokens={toCardTokens(C)} noPadding style={{ border: `1.5px solid ${C.border2}` }}>
            {allBookingsSorted.map((b, i) => {
              const svc = services.find(s => s.id === b.service_id);
              return (
                <div key={b.id} style={{ padding: "14px 16px", borderBottom: i < allBookingsSorted.length - 1 ? `1px solid ${C.border}` : "none", display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "42px", height: "42px", borderRadius: "13px", background: `${C.gold}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: "800", color: C.gold, flexShrink: 0, border: `1px solid ${C.border}` }}>{(b.citoyen_nom || "C").slice(0, 2).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.t1, fontSize: "13px", fontWeight: "800" }}>{b.citoyen_nom || "Citoyen"}</div>
                    <div style={{ color: C.t3, fontSize: "11px", marginTop: "1px" }}>{svc?.nom ?? "Prestation"}{svc ? ` · ${formatPrix(svc.prix)}` : ""}</div>
                    <div style={{ color: C.t3, fontSize: "10px", marginTop: "2px" }}>{formatDate(b.date_rdv)} · {b.heure_rdv}</div>
                  </div>
                  <span style={{ color: C.t2, fontSize: "10px", fontFamily: "monospace", letterSpacing: "1.5px", backgroundColor: C.bg3, padding: "2px 8px", borderRadius: "7px", border: `1px solid ${C.border}` }}>#{b.confirmation_code}</span>
                </div>
              );
            })}
          </Card>
        )
      )}
    </div>
  );
}
