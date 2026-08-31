"use client";

// Popup plein écran du profil d'un auteur "Yelen Community" (27/07/2026,
// retour Bryan, référence MoneyLion "BB"/profil). Un seul et même
// composant pour les deux cas : l'auteur d'un autre post, OU le compte
// connecté lui-même (estMoi = post.auteur_id === userId) — jamais un
// second compte, juste une vue différente du MÊME compte Yelen.
// Combine avec Yelen Rewards (retour Bryan) : seulement pour son propre
// profil (solde réel via /api/citoyen/rewards, jamais affiché pour un
// autre auteur — donnée privée).
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { YelenLoader } from "@/components/YelenLoader";
import { Avatar, BadgeVerifie, formatDateFr, type Post } from "@/components/CommunautePostCard";
import { SECTIONS_INTERET, type CentreInteretId } from "@/lib/centresInteret";

// Bio "Yelen Community" (22/08/2026, retour Bryan : "juste pour Yelen
// Community") — même limite que app/api/citoyen/bio/route.ts (BIO_MAX).
const BIO_MAX = 160;

export default function ProfilAuteurOverlay({
  post, estMoi, citoyenInterets, isDark, bg, card, t1, t2, t3, brd, onClose,
}: {
  post: Post;
  estMoi: boolean;
  citoyenInterets: string[];
  isDark: boolean; bg: string; card: string; t1: string; t2: string; t3: string; brd: string;
  onClose: () => void;
}) {
  const [publications, setPublications] = useState<Post[] | null>(null);
  const [solde, setSolde] = useState<number | null>(null);
  const [bio, setBio] = useState<string | null | undefined>(undefined);
  const [editionBio, setEditionBio] = useState(false);
  const [bioBrouillon, setBioBrouillon] = useState("");
  const [enregistrementBio, setEnregistrementBio] = useState(false);

  useEffect(() => {
    let annule = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { if (!annule) setBio(null); return; }
      const res = await fetch(`/api/citoyen/bio?userId=${post.auteur_id}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const j = await res.json().catch(() => null);
      if (!annule) setBio(res.ok ? (j?.bio ?? null) : null);
    })();
    return () => { annule = true; };
  }, [post.auteur_id]);

  function ouvrirEditionBio() {
    setBioBrouillon(bio ?? "");
    setEditionBio(true);
  }

  async function enregistrerBio() {
    setEnregistrementBio(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setEnregistrementBio(false); return; }
    const res = await fetch("/api/citoyen/bio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: session.access_token, bio: bioBrouillon }),
    });
    const j = await res.json().catch(() => null);
    setEnregistrementBio(false);
    if (!res.ok) return;
    setBio(j?.bio ?? null);
    setEditionBio(false);
  }

  useEffect(() => {
    let annule = false;
    (async () => {
      const { data } = await supabase
        .from("posts")
        .select("id, auteur_id, author_nom, author_photo_url, author_verifie, author_membre_depuis, contenu, images, nb_partages, created_at")
        .eq("auteur_id", post.auteur_id)
        .eq("statut", "publiee")
        .order("created_at", { ascending: false });
      if (!annule) setPublications((data as Post[]) ?? []);
    })();
    return () => { annule = true; };
  }, [post.auteur_id]);

  useEffect(() => {
    if (!estMoi) return;
    let annule = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/citoyen/rewards", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const j = await res.json().catch(() => null);
      if (!annule && res.ok && typeof j?.solde === "number") setSolde(j.solde);
    })();
    return () => { annule = true; };
  }, [estMoi]);

  const interetsLabels = estMoi
    ? SECTIONS_INTERET.flatMap(s => s.items).filter(i => citoyenInterets.includes(i.id as CentreInteretId)).map(i => i.label)
    : [];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1400, background: bg, display: "flex", flexDirection: "column" }}>
      <style>{`@keyframes profilFicheFadeIn{from{opacity:0}to{opacity:1}}`}</style>

      {/* Bouton fermer (22/08/2026) — fixe par rapport à l'écran, pas au
          contenu défilant, pour rester accessible quel que soit le scroll
          (voir bug corrigé ci-dessous : la couverture faisait partie du
          contenu fixe pendant que le nom défilait dessous). */}
      <button
        onClick={onClose}
        className="tap"
        aria-label="Fermer"
        style={{ position: "fixed", top: "calc(env(safe-area-inset-top) + 12px)", right: "16px", zIndex: 2, width: "36px", height: "36px", borderRadius: "50%", background: "rgba(0,0,0,0.32)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", cursor: "pointer" }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>

      {/* overscrollBehavior:"contain" (22/08/2026, retour Bryan) — empêche
          le rebond élastique du scroll interne de révéler le fond derrière
          la couverture en tirant vers le bas au-delà du haut (le
          overscroll-behavior-y:none global sur html/body ne couvre pas ce
          conteneur interne, contexte de scroll séparé). */}
      <main className="profil-scroll" style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", animation: "profilFicheFadeIn 0.2s ease" }}>
        {/* Couverture (22/08/2026, retour Bryan, référence Facebook) —
            fond couleur Yelen, jamais une image à uploader. Fait
            maintenant partie du contenu défilant (corrige le recouvrement
            constaté au scroll : avatar/couverture défilent avec le nom au
            lieu de rester fixes par-dessus). */}
        <div style={{ position: "relative" }}>
          <div style={{
            height: "132px", paddingTop: "env(safe-area-inset-top)", boxSizing: "content-box",
            background: isDark ? "linear-gradient(135deg,#2B2560,#17171C)" : "linear-gradient(160deg,#F5A623 0%,#E8960A 45%,#C8740A 100%)",
          }} />
          <div style={{ position: "absolute", left: "50%", bottom: "-44px", transform: "translateX(-50%)", width: "96px", height: "96px", borderRadius: "50%", background: bg, padding: "4px", boxSizing: "border-box" }}>
            <Avatar nom={post.author_nom} photo={post.author_photo_url} taille={88} />
          </div>
        </div>

        <div style={{ padding: "56px 20px 40px", width: "100%", maxWidth: "560px", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: t1, fontSize: "19px", fontWeight: 900 }}>{post.author_nom}</span>
            {post.author_verifie && <BadgeVerifie />}
          </div>
          <div style={{ color: t2, fontSize: "12.5px", marginTop: "4px" }}>Membre de Yelen depuis {formatDateFr(post.author_membre_depuis)}</div>
        </div>

        {(bio !== undefined || editionBio) && (
          <div style={{ marginBottom: "20px" }}>
            {editionBio ? (
              <div>
                <textarea
                  autoFocus
                  value={bioBrouillon}
                  onChange={e => setBioBrouillon(e.target.value.slice(0, BIO_MAX))}
                  placeholder="Présentez-vous en quelques mots…"
                  style={{ width: "100%", minHeight: "64px", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", border: `1px solid ${brd}`, borderRadius: "12px", padding: "10px 12px", color: t1, fontSize: "13px", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", textAlign: "left" }}
                />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "8px" }}>
                  <span style={{ color: t3, fontSize: "11px" }}>{bioBrouillon.length}/{BIO_MAX}</span>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={() => setEditionBio(false)} className="tap" style={{ background: "none", border: "none", color: t2, fontSize: "12.5px", fontWeight: 700, cursor: "pointer", padding: "6px 10px" }}>Annuler</button>
                    <button onClick={enregistrerBio} disabled={enregistrementBio} className="tap" style={{ display: "flex", alignItems: "center", gap: "6px", background: "#F5A623", border: "none", borderRadius: "8px", color: "#080812", fontSize: "12.5px", fontWeight: 800, cursor: "pointer", padding: "6px 14px" }}>
                      {enregistrementBio ? <YelenLoader size={12} color="#080812" /> : "Enregistrer"}
                    </button>
                  </div>
                </div>
              </div>
            ) : bio ? (
              <div style={{ textAlign: "center" }}>
                <div style={{ color: t1, fontSize: "13px", lineHeight: 1.5 }}>{bio}</div>
                {estMoi && (
                  <button onClick={ouvrirEditionBio} className="tap" style={{ marginTop: "6px", background: "none", border: "none", color: "#F5A623", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", padding: "4px" }}>Modifier</button>
                )}
              </div>
            ) : estMoi ? (
              <div style={{ textAlign: "center" }}>
                <button onClick={ouvrirEditionBio} className="tap" style={{ background: "none", border: `1px dashed ${brd}`, borderRadius: "10px", color: t2, fontSize: "12px", fontWeight: 700, cursor: "pointer", padding: "8px 14px" }}>
                  + Ajouter une bio
                </button>
              </div>
            ) : null}
          </div>
        )}

        {estMoi && (
          <Link
            href="/menu/recompenses"
            className="tap"
            style={{ display: "flex", alignItems: "center", gap: "12px", background: isDark ? "linear-gradient(135deg,#2B2560,#17171C)" : "linear-gradient(135deg,#FFE9BE,#F5A623)", borderRadius: "16px", padding: "16px", marginBottom: "20px", textDecoration: "none" }}
          >
            <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: isDark ? "rgba(245,166,35,0.18)" : "rgba(255,255,255,0.55)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill={isDark ? "#F5A623" : "#5C3D00"}><path d="M12 3c.8 4.4 2.8 6.4 7 7-4.2.8-6.2 2.8-7 7-.8-4.2-2.8-6.2-7-7 4.2-.6 6.2-2.6 7-7z" /></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: isDark ? "#fff" : "#1C1300", fontSize: "13.5px", fontWeight: 900 }}>Yelen Rewards</div>
              <div style={{ color: isDark ? "rgba(255,255,255,0.7)" : "rgba(28,19,0,0.65)", fontSize: "11.5px" }}>
                {solde === null ? "Voir mes récompenses" : `${solde.toLocaleString("fr-FR")} points — voir tout`}
              </div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isDark ? "#FFC65C" : "#5C3D00"} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </Link>
        )}

        {estMoi && interetsLabels.length > 0 && (
          <div style={{ marginBottom: "24px" }}>
            <div style={{ color: t2, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "10px" }}>Centres d&apos;intérêt</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {interetsLabels.map(l => (
                <span key={l} style={{ background: card, border: `1px solid ${brd}`, borderRadius: "20px", padding: "6px 12px", color: t1, fontSize: "12px", fontWeight: 700 }}>{l}</span>
              ))}
            </div>
          </div>
        )}

        <div>
          <div style={{ color: t2, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "10px" }}>Publications</div>
          {publications === null ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "20px" }}><YelenLoader size={20} color={t2} /></div>
          ) : publications.length === 0 ? (
            <div style={{ color: t3, fontSize: "12.5px", textAlign: "center", padding: "20px" }}>Aucune publication pour l&apos;instant.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {publications.map(p => (
                <div key={p.id} style={{ background: card, border: `1px solid ${brd}`, borderRadius: "14px", padding: "14px" }}>
                  <div style={{ color: t2, fontSize: "11px", marginBottom: "6px" }}>{formatDateFr(p.created_at)}</div>
                  {p.contenu && <div style={{ color: t1, fontSize: "13px", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{p.contenu}</div>}
                  {p.images && p.images.length > 0 && (
                    <div style={{ display: "flex", gap: "6px", marginTop: "8px", overflowX: "auto" }}>
                      {p.images.map((url, i) => (
                        <div key={i} style={{ position: "relative", width: "64px", height: "64px", borderRadius: "8px", overflow: "hidden", flexShrink: 0 }}>
                          <Image src={url} alt="" fill sizes="64px" style={{ objectFit: "cover" }} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      </main>
    </div>
  );
}
