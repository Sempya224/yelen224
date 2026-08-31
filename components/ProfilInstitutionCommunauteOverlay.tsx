"use client";

// Carte de profil institution dans Yelen Community (22/08/2026, retour
// Bryan) — ouverte au clic sur un post institution, distincte de
// ProfilAuteurOverlay.tsx (citoyen) : pas de bannière dégradée générique +
// avatar rond, pas de bloc Yelen Rewards/centres d'intérêt (aucun sens pour
// une institution). Contenu extrait des mêmes colonnes que la fiche
// publique (InstitutionPublicClient.tsx) : description, avis, année de
// création, capacité, adresse, services — lecture directe côté client, la
// policy RLS `institutions_public_read USING (statut='validee')` autorise
// déjà cette lecture (aucune institution non validée ne peut apparaître
// dans le fil de toute façon, ses posts ne sont jamais publiés). CTA fixe
// en bas vers la vraie fiche publique — jamais un doublon de contenu.
import { useEffect, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { YelenLoader } from "@/components/YelenLoader";
import { SECTEUR_LABELS, SECTEUR_META } from "@/lib/institutionTaxonomy";
import { InstitutionBadgeVerifie } from "@/lib/institutionBadge";
import { AvatarInstitution, CategorieBadge, tempsRelatif, SAbonnerButton, type Post } from "@/components/CommunautePostCard";
import { urlExterneSure } from "@/lib/urlValidation";
import { POST_CATEGORIE_COULEURS, POST_CATEGORIE_LABELS, type PostCategorie } from "@/lib/communauteCategories";

type InstitutionApercu = {
  id: string;
  name: string;
  secteur: string | null;
  logo: string | null;
  banniere: string | null;
  description: string | null;
  badge_verifie: boolean;
  moyenne_avis: number | null;
  nb_avis: number | null;
  annee_creation: string | null;
  capacite: string | null;
  adresse: string | null;
  ville: string | null;
  quartier: string | null;
  services: unknown;
  website: string | null;
  // Chaîne Yelen (23/08/2026) — compteur réel maintenu par trigger DB
  // (recalculer_nb_abonnes_institution), jamais calculé côté client.
  nb_abonnes: number;
};

// Aperçu tronqué à ~4 lignes (23/08/2026, retour Bryan : la description
// complète — parfois plusieurs paragraphes — poussait le CTA "Découvrir
// l'établissement" trop bas) — même seuil que PostCard.CONTENU_MAX
// (CommunautePostCard.tsx), "Voir plus" déplie en place plutôt qu'un sheet
// séparé : cet écran est déjà une fiche dédiée, pas une carte de fil.
const DESCRIPTION_MAX = 220;

function toServiceLabel(entry: unknown): string {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && "nom" in entry) {
    const nom = (entry as { nom?: unknown }).nom;
    return typeof nom === "string" ? nom : "";
  }
  return "";
}
function parseServices(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(toServiceLabel).filter(Boolean);
  if (typeof v === "string") {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p.map(toServiceLabel).filter(Boolean) : []; }
    catch { return v.split(/[,\n]/).map(s => s.trim()).filter(Boolean); }
  }
  return [];
}

export default function ProfilInstitutionCommunauteOverlay({
  institutionId, isDark, bg, card, t1, t2, t3, brd, onClose, onDecouvrir, onOuvrirPost,
  estAbonne, onToggleAbonnement,
}: {
  institutionId: string;
  isDark: boolean; bg: string; card: string; t1: string; t2: string; t3: string; brd: string;
  onClose: () => void;
  onDecouvrir: () => void;
  onOuvrirPost: (post: Post) => void;
  // Reçoit le nom réel de l'institution (pas juste l'ID) — nécessaire au
  // parent (app/page.tsx) pour afficher AbonnementConfirmationSheet, qui
  // n'a lui-même que institutionId en state.
  estAbonne: boolean; onToggleAbonnement: (nom: string) => void;
}) {
  const [inst, setInst] = useState<InstitutionApercu | null | undefined>(undefined);
  const [bannerErr, setBannerErr] = useState(false);
  const [descriptionOuverte, setDescriptionOuverte] = useState(false);
  // Publications de l'établissement dans Yelen Community (23/08/2026, retour
  // Bryan) — même table/filtre que le fil principal (app/page.tsx,
  // chargerFilCommunaute), juste borné à cette institution. undefined =
  // chargement, [] = aucune publication encore (jamais masqué en silence,
  // même principe que le reste de cet écran).
  const [posts, setPosts] = useState<Post[] | undefined>(undefined);

  useEffect(() => {
    let vivant = true;
    (async () => {
      const { data } = await supabase
        .from("institutions")
        .select("id, name, secteur, logo, banniere, description, badge_verifie, moyenne_avis, nb_avis, annee_creation, capacite, adresse, ville, quartier, services, website, nb_abonnes")
        .eq("id", institutionId)
        .maybeSingle();
      if (vivant) setInst((data as InstitutionApercu) ?? null);
    })();
    return () => { vivant = false; };
  }, [institutionId]);

  useEffect(() => {
    let vivant = true;
    (async () => {
      const { data } = await supabase
        .from("posts")
        .select("id, auteur_id, auteur_type, institution_auteur_id, categorie, author_nom, author_photo_url, author_verifie, author_membre_depuis, contenu, images, nb_partages, created_at")
        .eq("institution_auteur_id", institutionId)
        .eq("statut", "publiee")
        .order("created_at", { ascending: false })
        .limit(10);
      if (vivant) setPosts((data as Post[]) ?? []);
    })();
    return () => { vivant = false; };
  }, [institutionId]);

  const services = inst ? parseServices(inst.services) : [];
  const couleurSecteur = (inst?.secteur && SECTEUR_META[inst.secteur]?.color) || "#0095F6";
  const websiteHref = urlExterneSure(inst?.website);
  const descriptionTexte = inst?.description ?? "";
  const descriptionDepasse = descriptionTexte.length > DESCRIPTION_MAX || descriptionTexte.split("\n").length > 4;
  const descriptionAffichee = !descriptionOuverte && descriptionDepasse
    ? descriptionTexte.slice(0, DESCRIPTION_MAX).trimEnd()
    : descriptionTexte;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1400, background: bg, display: "flex", flexDirection: "column" }}>
      <button onClick={onClose} aria-label="Fermer" className="tap" style={{ position: "fixed", top: "calc(env(safe-area-inset-top) + 12px)", right: "16px", zIndex: 2, width: "36px", height: "36px", borderRadius: "50%", background: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>

      {inst === undefined ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><YelenLoader size={28} color={t2} /></div>
      ) : inst === null ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", textAlign: "center" }}>
          <p style={{ color: t2, fontSize: "13px" }}>Cet établissement n&apos;est plus disponible.</p>
        </div>
      ) : (
        <>
          <div style={{ flex: 1, overflowY: "auto", paddingBottom: "90px" }}>
            <div style={{ height: "120px", position: "relative", overflow: "hidden", background: `linear-gradient(120deg, ${couleurSecteur}, #080812)` }}>
              {inst.banniere && !bannerErr && (
                <Image src={inst.banniere} alt="" fill sizes="100vw" priority onError={() => setBannerErr(true)} style={{ objectFit: "cover" }} />
              )}
            </div>
            <div style={{ padding: "0 20px" }}>
              <div style={{ marginTop: "-36px", marginBottom: "12px" }}>
                <div style={{ display: "inline-block", border: `4px solid ${bg}`, borderRadius: "20px" }}>
                  <AvatarInstitution nom={inst.name} logo={inst.logo} taille={76} />
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                <div style={{ color: t1, fontSize: "19px", fontWeight: 900, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inst.name}</div>
                <SAbonnerButton abonne={estAbonne} onToggle={() => onToggleAbonnement(inst.name)} t2={t2} />
                {websiteHref && (
                  <a href={websiteHref} target="_blank" rel="noreferrer" className="tap" style={{ display: "flex", alignItems: "center", gap: "5px", flexShrink: 0, background: card, border: "1px solid #F5A623", borderRadius: "20px", padding: "7px 13px", color: t1, fontSize: "12px", fontWeight: 700, textDecoration: "none" }}>
                    Site web
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7" /><path d="M8 7h9v9" /></svg>
                  </a>
                )}
              </div>
              <div style={{ marginBottom: "4px" }}>
                <InstitutionBadgeVerifie verifie={inst.badge_verifie} couleurTexte={t2} taille={14} />
              </div>
              {inst.secteur && (
                <div style={{ color: couleurSecteur, fontSize: "12.5px", fontWeight: 700, marginBottom: "16px" }}>
                  {SECTEUR_LABELS[inst.secteur] || inst.secteur}
                </div>
              )}

              {inst.description && (
                <div style={{ marginBottom: "20px" }}>
                  <p style={{ color: t2, fontSize: "13px", lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>
                    {descriptionAffichee}{!descriptionOuverte && descriptionDepasse ? "…" : ""}
                  </p>
                  {descriptionDepasse && (
                    <button onClick={() => setDescriptionOuverte(o => !o)} className="tap" style={{ display: "block", background: "none", border: "none", padding: "6px 0 0", color: "#F5A623", fontSize: "12.5px", fontWeight: 800, cursor: "pointer" }}>
                      {descriptionOuverte ? "Voir moins" : "Voir plus"}
                    </button>
                  )}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: "10px", marginBottom: "20px" }}>
                <div style={{ background: card, border: `1px solid ${brd}`, borderRadius: "14px", padding: "12px", textAlign: "center" }}>
                  <div style={{ color: t1, fontSize: "15px", fontWeight: 900, marginBottom: "2px" }}>{inst.nb_abonnes.toLocaleString("fr-FR")}</div>
                  <div style={{ color: t3, fontSize: "10.5px" }}>Abonnés</div>
                </div>
                {inst.annee_creation && (
                  <div style={{ background: card, border: `1px solid ${brd}`, borderRadius: "14px", padding: "12px", textAlign: "center" }}>
                    <div style={{ color: t1, fontSize: "15px", fontWeight: 900, marginBottom: "2px" }}>{inst.annee_creation}</div>
                    <div style={{ color: t3, fontSize: "10.5px" }}>Fondée en</div>
                  </div>
                )}
                {inst.capacite && (
                  <div style={{ background: card, border: `1px solid ${brd}`, borderRadius: "14px", padding: "12px", textAlign: "center" }}>
                    <div style={{ color: t1, fontSize: "15px", fontWeight: 900, marginBottom: "2px" }}>{inst.capacite}</div>
                    <div style={{ color: t3, fontSize: "10.5px" }}>Capacité</div>
                  </div>
                )}
              </div>

              {(inst.adresse || inst.ville) && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "20px" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={t3} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "2px" }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                  <span style={{ color: t2, fontSize: "12.5px", lineHeight: 1.5 }}>
                    {[inst.adresse, inst.quartier, inst.ville].filter(Boolean).join(", ")}
                  </span>
                </div>
              )}

              {posts && posts.length > 0 && (
                <div style={{ marginBottom: "20px" }}>
                  <div style={{ color: t3, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "10px" }}>Publications</div>
                  <div style={{ display: "flex", gap: "10px", overflowX: "auto", margin: "0 -20px", padding: "0 20px 4px" }}>
                    {posts.map(p => {
                      const couleurCat = POST_CATEGORIE_COULEURS[p.categorie as PostCategorie];
                      const labelCat = POST_CATEGORIE_LABELS[p.categorie as PostCategorie];
                      return (
                        <button
                          key={p.id}
                          onClick={() => onOuvrirPost(p)}
                          className="tap"
                          style={{ flexShrink: 0, width: "150px", textAlign: "left", background: card, border: `1px solid ${brd}`, borderRadius: "14px", overflow: "hidden", cursor: "pointer", display: "flex", flexDirection: "column", padding: 0 }}
                        >
                          {p.images && p.images[0] ? (
                            <div style={{ position: "relative", width: "100%", height: "90px", flexShrink: 0 }}>
                              <Image src={p.images[0]} alt="" fill sizes="150px" style={{ objectFit: "cover" }} />
                            </div>
                          ) : (
                            <div style={{ width: "100%", height: "90px", flexShrink: 0, background: couleurCat ? `${couleurCat}18` : `${couleurSecteur}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <CategorieBadge categorie={p.categorie} taille={34} />
                            </div>
                          )}
                          <div style={{ padding: "10px" }}>
                            {labelCat && <div style={{ color: couleurCat || t3, fontSize: "9.5px", fontWeight: 800, marginBottom: "4px" }}>{labelCat}</div>}
                            {p.contenu && (
                              <div style={{ color: t1, fontSize: "11.5px", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.contenu}</div>
                            )}
                            <div style={{ color: t3, fontSize: "10px", marginTop: "6px" }}>{tempsRelatif(p.created_at)}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {services.length > 0 && (
                <div style={{ marginBottom: "20px" }}>
                  <div style={{ color: t3, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "10px" }}>Services</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {services.map((s, i) => (
                      <span key={i} style={{ background: card, border: `1px solid ${brd}`, borderRadius: "20px", padding: "6px 12px", color: t1, fontSize: "12px", fontWeight: 600 }}>{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "12px 20px calc(12px + env(safe-area-inset-bottom))", background: bg, borderTop: `1px solid ${brd}` }}>
            <button onClick={onDecouvrir} className="tap" style={{ width: "100%", background: "linear-gradient(160deg,#F5A623 0%,#E8960A 45%,#C8740A 100%)", border: "none", borderRadius: "14px", padding: "14px", color: "#080812", fontSize: "14px", fontWeight: 800, cursor: "pointer" }}>
              Découvrir {inst.name}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
