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
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { YelenLoader } from "@/components/YelenLoader";
import { Avatar, BadgeVerifie, formatDateFr, type Post } from "@/components/CommunautePostCard";
import { SECTIONS_INTERET, type CentreInteretId } from "@/lib/centresInteret";

export default function ProfilAuteurOverlay({
  post, estMoi, citoyenInterets, isDark, bg, card, card2, t1, t2, t3, brd, onClose,
}: {
  post: Post;
  estMoi: boolean;
  citoyenInterets: string[];
  isDark: boolean; bg: string; card: string; card2: string; t1: string; t2: string; t3: string; brd: string;
  onClose: () => void;
}) {
  const [publications, setPublications] = useState<Post[] | null>(null);
  const [solde, setSolde] = useState<number | null>(null);

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
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: bg, display: "flex", flexDirection: "column" }}>
      <style>{`@keyframes profilFicheFadeIn{from{opacity:0}to{opacity:1}}`}</style>
      <header style={{ position: "sticky", top: 0, zIndex: 1, background: bg, borderBottom: `1px solid ${brd}`, paddingTop: "env(safe-area-inset-top)", flexShrink: 0 }}>
        <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "12px" }}>
          <span />
          <div style={{ color: t1, fontSize: "16px", fontWeight: 800, textAlign: "center" }}>Profil</div>
          <button
            onClick={onClose}
            className="tap"
            aria-label="Fermer"
            style={{ justifySelf: "end", width: "36px", height: "36px", borderRadius: "50%", background: card2, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      </header>

      <main style={{ flex: 1, overflowY: "auto", padding: "24px 20px 40px", width: "100%", maxWidth: "560px", margin: "0 auto", boxSizing: "border-box", animation: "profilFicheFadeIn 0.2s ease" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: "24px" }}>
          <Avatar nom={post.author_nom} photo={post.author_photo_url} taille={88} />
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "14px" }}>
            <span style={{ color: t1, fontSize: "19px", fontWeight: 900 }}>{post.author_nom}</span>
            {post.author_verifie && <BadgeVerifie />}
          </div>
          <div style={{ color: t2, fontSize: "12.5px", marginTop: "4px" }}>Membre de Yelen depuis {formatDateFr(post.author_membre_depuis)}</div>
        </div>

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
                        <img key={i} src={url} alt="" style={{ width: "64px", height: "64px", borderRadius: "8px", objectFit: "cover", flexShrink: 0 }} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
