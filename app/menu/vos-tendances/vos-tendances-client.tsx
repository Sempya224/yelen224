"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader } from "@/components/CompteEcranVide";
import { YelenLoaderEcran } from "@/components/YelenLoader";

// "Vos tendances" — chantier engagement du 25/07/2026. Contrairement à
// Leçons d'argent / Calculatrice, aucune recherche externe n'était
// nécessaire ici : la source, c'est l'activité réelle du citoyen dans
// Yelen (rdv, favoris, avis, démarches). Zéro score composite affiché
// (décision actée le 21/07/2026 dans le plan rétention : jamais de score
// numérique visible attribué à un citoyen) — uniquement des comptages et
// tendances factuels. Ajout personnel (au-delà du périmètre initialement
// proposé) : le jour de la semaine où le citoyen prend le plus souvent
// RDV, dérivé de `date_rdv`, affiché seulement à partir de 3 RDV pour
// éviter un "motif" tiré d'un seul point de donnée.
const MOIS_LABEL = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
const JOURS_LABEL = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

type RdvRow = { id: string; institution_id: string; date_rdv: string; statut: string; institutions: { id: string; name: string; secteur: string | null } | null };

const Illu = {
  hero: () => (
    <svg viewBox="0 0 88 88" width="88" height="88">
      <circle cx="44" cy="44" r="44" fill="#EDE9FE"/>
      <rect x="24" y="46" width="9" height="20" rx="2" fill="#C4B5FD"/>
      <rect x="37" y="36" width="9" height="30" rx="2" fill="#A78BFA"/>
      <rect x="50" y="24" width="9" height="42" rx="2" fill="#7C3AED"/>
      <path d="M24 32l10-9 8 6 12-14" stroke="#F5A623" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M46 9h8v8" stroke="#F5A623" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  ),
  rdv: () => (<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="22" fill="#E0E7FF"/><rect x="12" y="11" width="20" height="20" rx="3" fill="#4F46E5"/><rect x="16" y="8" width="3" height="6" rx="1.5" fill="#4F46E5"/><rect x="25" y="8" width="3" height="6" rx="1.5" fill="#4F46E5"/><rect x="15" y="19" width="14" height="2.4" rx="1.2" fill="#C7D2FE"/></svg>),
  favoris: () => (<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="22" fill="#FFE4E6"/><path d="M22 31s-9-5.5-9-12.5A5.5 5.5 0 0 1 22 15a5.5 5.5 0 0 1 9 3.5C31 25.5 22 31 22 31z" fill="#E11D48"/></svg>),
  avis: () => (<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="22" fill="#FEF3C7"/><polygon points="22,10 25.5,18 34,19 27.5,24.5 29.5,33 22,28.5 14.5,33 16.5,24.5 10,19 18.5,18" fill="#F5A623"/></svg>),
  demarches: () => (<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="22" fill="#D1FAE5"/><rect x="13" y="10" width="18" height="24" rx="3" fill="#0F766E"/><path d="M18 21l3 3 6-7" stroke="#D1FAE5" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>),
  secteur: () => (<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="22" fill="#CFFAFE"/><path d="M22 10l11 6v10c0 8-5 12-11 14-6-2-11-6-11-14V16z" fill="#0891B2"/></svg>),
  etablissement: () => (<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="22" fill="#FDE68A"/><path d="M12 34V17l10-7 10 7v17z" fill="#92400E"/><rect x="19" y="24" width="6" height="10" fill="#FDE68A"/></svg>),
  jour: () => (<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="22" fill="#FCE7F3"/><circle cx="22" cy="23" r="11" fill="none" stroke="#DB2777" strokeWidth="2.6"/><line x1="22" y1="23" x2="22" y2="16" stroke="#DB2777" strokeWidth="2.6" strokeLinecap="round"/><line x1="22" y1="23" x2="27" y2="26" stroke="#DB2777" strokeWidth="2.6" strokeLinecap="round"/></svg>),
  ctaLecons: () => (
    <svg viewBox="0 0 72 72" width="72" height="72">
      <circle cx="36" cy="36" r="36" fill="rgba(255,255,255,0.14)"/>
      <path d="M36 26c-3.6-3-8.4-4.2-13-3.4v23c4.6-.8 9.4.4 13 3.4V26z" fill="#fff"/>
      <path d="M36 26c3.6-3 8.4-4.2 13-3.4v23c-4.6-.8-9.4.4-13 3.4V26z" fill="#F5A623"/>
      <circle cx="48" cy="18" r="7" fill="#F5A623"/>
      <text x="48" y="21.5" fontSize="9" fontWeight="800" fill="#fff" textAnchor="middle">$</text>
    </svg>
  ),
};

const SECTEUR_LABEL: Record<string, string> = {
  "santé": "Santé", "administratif": "Administratif", "financier": "Institutions financières",
  "juridique": "Juridique", "beauté_bien_etre": "Beauté & bien-être", "commerce": "Commerce",
  "artisanat": "Artisanat", "services_divers": "Services divers",
};

export function VosTendancesClient() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg    = isDark ? "#0A0A0F" : "#F2F2F7";
  const card  = isDark ? "#1C1C1E" : "#FFFFFF";
  const card2 = isDark ? "#2C2C2E" : "#EBEBF0";
  const t1    = isDark ? "#FFFFFF" : "#000000";
  const t2    = isDark ? "#8E8E93" : "#6C6C70";
  const t3    = isDark ? "#636366" : "#AEAEB2";

  const [loading, setLoading] = useState(true);
  const [totalRdv, setTotalRdv] = useState(0);
  const [parMois, setParMois] = useState<{ label: string; total: number }[]>([]);
  const [totalFavoris, setTotalFavoris] = useState(0);
  const [totalAvis, setTotalAvis] = useState(0);
  const [noteMoyenne, setNoteMoyenne] = useState<number | null>(null);
  const [demarchesEnCours, setDemarchesEnCours] = useState(0);
  const [secteurTop, setSecteurTop] = useState<string | null>(null);
  const [etablissementTop, setEtablissementTop] = useState<string | null>(null);
  const [jourTop, setJourTop] = useState<string | null>(null);
  const [membreDepuis, setMembreDepuis] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let userId: string | null = null;
    try { userId = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!userId) { router.replace("/inscription"); return; }

    void (async () => {
      setLoading(true);
      const [rdvRes, favRes, avisRes, demRes, userRes] = await Promise.all([
        supabase.from("rdv").select("id,institution_id,date_rdv,statut,institutions!rdv_institution_id_fkey(id,name,secteur)").eq("citoyen_id", userId),
        supabase.from("citoyen_favoris").select("id", { count: "exact", head: true }).eq("citoyen_id", userId),
        supabase.from("avis").select("note").eq("citoyen_id", userId).eq("brouillon", false),
        supabase.from("citoyen_demarches").select("id", { count: "exact", head: true }).eq("citoyen_id", userId).eq("statut", "en_cours"),
        supabase.from("users").select("created_at").eq("id", userId).maybeSingle(),
      ]);

      const rdvs = (rdvRes.data ?? []) as unknown as RdvRow[];
      setTotalRdv(rdvs.length);
      setTotalFavoris(favRes.count ?? 0);
      setDemarchesEnCours(demRes.count ?? 0);

      const avis = avisRes.data ?? [];
      setTotalAvis(avis.length);
      if (avis.length > 0) setNoteMoyenne(avis.reduce((s, a) => s + (a.note ?? 0), 0) / avis.length);

      // 6 derniers mois, comptage réel par mois de date_rdv.
      const maintenant = new Date();
      const buckets: { label: string; total: number; key: string }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
        buckets.push({ label: MOIS_LABEL[d.getMonth()], total: 0, key: `${d.getFullYear()}-${d.getMonth()}` });
      }
      for (const r of rdvs) {
        if (!r.date_rdv) continue;
        const d = new Date(r.date_rdv);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const b = buckets.find(x => x.key === key);
        if (b) b.total++;
      }
      setParMois(buckets.map(b => ({ label: b.label, total: b.total })));

      if (rdvs.length >= 3) {
        const parSecteur = new Map<string, number>();
        const parEtablissement = new Map<string, number>();
        const parJour = new Map<number, number>();
        for (const r of rdvs) {
          const secteur = r.institutions?.secteur;
          if (secteur) parSecteur.set(secteur, (parSecteur.get(secteur) ?? 0) + 1);
          const nom = r.institutions?.name;
          if (nom) parEtablissement.set(nom, (parEtablissement.get(nom) ?? 0) + 1);
          if (r.date_rdv) {
            const jour = new Date(r.date_rdv).getDay();
            parJour.set(jour, (parJour.get(jour) ?? 0) + 1);
          }
        }
        const top = <K,>(m: Map<K, number>): K | null => {
          let meilleur: K | null = null, max = 0;
          for (const [k, v] of m) if (v > max) { max = v; meilleur = k; }
          return meilleur;
        };
        const secteur = top(parSecteur);
        setSecteurTop(secteur ? (SECTEUR_LABEL[secteur] ?? secteur) : null);
        setEtablissementTop(top(parEtablissement));
        const jour = top(parJour);
        setJourTop(jour !== null ? JOURS_LABEL[jour] : null);
      }

      const createdAt = userRes.data?.created_at as string | undefined;
      if (createdAt) {
        const mois = Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30)));
        setMembreDepuis(mois < 1 ? "moins d'un mois" : mois === 1 ? "1 mois" : mois < 24 ? `${mois} mois` : `${Math.round(mois / 12)} ans`);
      }

      setLoading(false);
    })();
  }, [router]);

  const maxMois = Math.max(1, ...parMois.map(m => m.total));

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`
        @keyframes screenIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes cardIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes barGrow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
      `}</style>
      <CompteHeader titre="Vos tendances" fondNeutre retourHref="/?menu=1"/>

      <div style={{ padding: "28px 20px 8px", textAlign: "center", animation: "screenIn 0.35s ease" }}>
        <div style={{ margin: "0 auto 16px", width: "88px" }}>{Illu.hero()}</div>
        <div style={{ color: t1, fontSize: "20px", fontWeight: "900", marginBottom: "6px" }}>Vos tendances</div>
        <div style={{ color: t2, fontSize: "13px", lineHeight: "1.5" }}>Vos vrais chiffres sur Yelen. Rien d&apos;inventé, rien de deviné.</div>
      </div>

      {loading ? (
        <YelenLoaderEcran labelColor={t3}/>
      ) : totalRdv === 0 ? (
        <div style={{ padding: "50px 20px", textAlign: "center", color: t3, fontSize: "13.5px", lineHeight: "1.6" }}>
          Rien à montrer pour l&apos;instant. Prenez votre premier RDV, et on vous montre vos tendances ici.
        </div>
      ) : (
        <div style={{ padding: "12px 20px 40px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
            {[
              { icon: Illu.rdv, valeur: totalRdv, label: "Rendez-vous" },
              { icon: Illu.favoris, valeur: totalFavoris, label: "Favoris" },
              { icon: Illu.avis, valeur: totalAvis, label: noteMoyenne ? `Avis (${noteMoyenne.toFixed(1)}★ moy.)` : "Avis" },
              { icon: Illu.demarches, valeur: demarchesEnCours, label: "Démarches en cours" },
            ].map((s, i) => (
              <div key={s.label} style={{ backgroundColor: card, borderRadius: "18px", padding: "16px", boxShadow: isDark ? "none" : "0 2px 10px rgba(0,0,0,0.05)", animation: `cardIn 0.35s ease ${i * 0.06}s both` }}>
                <div style={{ marginBottom: "10px" }}>{s.icon()}</div>
                <div style={{ color: t1, fontSize: "22px", fontWeight: "900", marginBottom: "2px" }}>{s.valeur}</div>
                <div style={{ color: t2, fontSize: "11.5px", fontWeight: "700" }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ backgroundColor: card, borderRadius: "18px", padding: "18px", marginBottom: "16px", boxShadow: isDark ? "none" : "0 2px 10px rgba(0,0,0,0.05)", animation: "cardIn 0.35s ease 0.24s both" }}>
            <div style={{ color: t2, fontSize: "12px", fontWeight: "800", marginBottom: "16px" }}>Vos RDV, mois par mois</div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", height: "80px", gap: "8px" }}>
              {parMois.map((m, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", height: "100%", justifyContent: "flex-end" }}>
                  <div style={{ width: "100%", maxWidth: "26px", height: `${Math.max(6, (m.total / maxMois) * 64)}px`, borderRadius: "6px", backgroundColor: m.total > 0 ? "#7C3AED" : card2, transformOrigin: "bottom", animation: `barGrow 0.5s cubic-bezier(.34,1.56,.64,1) ${0.3 + i * 0.05}s both` }}/>
                  <span style={{ color: t3, fontSize: "10px", fontWeight: "700" }}>{m.label}</span>
                </div>
              ))}
            </div>
          </div>

          {(secteurTop || etablissementTop || jourTop) && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {secteurTop && (
                <div style={{ display: "flex", alignItems: "center", gap: "12px", backgroundColor: card, borderRadius: "16px", padding: "14px", boxShadow: isDark ? "none" : "0 2px 10px rgba(0,0,0,0.05)", animation: "cardIn 0.35s ease 0.3s both" }}>
                  {Illu.secteur()}
                  <div>
                    <div style={{ color: t2, fontSize: "11px", fontWeight: "700" }}>Votre secteur préféré</div>
                    <div style={{ color: t1, fontSize: "14.5px", fontWeight: "800" }}>{secteurTop}</div>
                  </div>
                </div>
              )}
              {etablissementTop && (
                <div style={{ display: "flex", alignItems: "center", gap: "12px", backgroundColor: card, borderRadius: "16px", padding: "14px", boxShadow: isDark ? "none" : "0 2px 10px rgba(0,0,0,0.05)", animation: "cardIn 0.35s ease 0.36s both" }}>
                  {Illu.etablissement()}
                  <div>
                    <div style={{ color: t2, fontSize: "11px", fontWeight: "700" }}>Là où vous allez le plus</div>
                    <div style={{ color: t1, fontSize: "14.5px", fontWeight: "800" }}>{etablissementTop}</div>
                  </div>
                </div>
              )}
              {jourTop && (
                <div style={{ display: "flex", alignItems: "center", gap: "12px", backgroundColor: card, borderRadius: "16px", padding: "14px", boxShadow: isDark ? "none" : "0 2px 10px rgba(0,0,0,0.05)", animation: "cardIn 0.35s ease 0.42s both" }}>
                  {Illu.jour()}
                  <div>
                    <div style={{ color: t2, fontSize: "11px", fontWeight: "700" }}>Le jour où vous venez le plus</div>
                    <div style={{ color: t1, fontSize: "14.5px", fontWeight: "800", textTransform: "capitalize" }}>{jourTop}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          <Link href="/menu/lecons-argent" className="tap" style={{ display: "flex", alignItems: "center", gap: "14px", textDecoration: "none", borderRadius: "20px", padding: "18px", marginTop: "16px", background: "linear-gradient(135deg,#1B1B2B 0%,#3D2E5C 100%)", boxShadow: "0 4px 16px rgba(27,27,43,0.25)", animation: "cardIn 0.35s ease 0.46s both" }}>
            <div style={{ flexShrink: 0 }}>{Illu.ctaLecons()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "#fff", fontSize: "14.5px", fontWeight: "800", marginBottom: "3px" }}>Envie d&apos;y voir plus clair sur votre argent ?</div>
              <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "12px", lineHeight: "1.5" }}>Nos leçons expliquent le crédit et l&apos;épargne simplement, avec des vraies infos sur la Guinée.</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="m9 18 6-6-6-6"/></svg>
          </Link>

          {membreDepuis && (
            <div style={{ textAlign: "center", color: t3, fontSize: "12px", marginTop: "20px", marginBottom: "20px" }}>Sur Yelen depuis {membreDepuis}</div>
          )}

          <div style={{ backgroundColor: card, borderRadius: "18px", padding: "18px", boxShadow: isDark ? "none" : "0 2px 10px rgba(0,0,0,0.05)", animation: "cardIn 0.35s ease 0.48s both" }}>
            <div style={{ color: t1, fontSize: "13.5px", fontWeight: "800", marginBottom: "12px" }}>D&apos;où viennent ces chiffres</div>
            <div style={{ color: t2, fontSize: "12.5px", lineHeight: "1.7" }}>
              On compte. C&apos;est tout. Vos RDV, vos favoris, vos avis, vos démarches : ce sont les vrais chiffres de votre compte, pas une estimation.
              <br/><br/>
              Le graphique, c&apos;est le nombre de RDV que vous avez pris chaque mois, sur les 6 derniers mois. Rien de plus.
              <br/><br/>
              Votre secteur, votre adresse et votre jour &quot;préférés&quot; ? On regarde simplement ce qui revient le plus souvent chez vous. On attend que vous ayez au moins 3 RDV avant de vous le dire — un seul rendez-vous, ça ne fait pas une habitude.
              <br/><br/>
              Pas d&apos;IA ici. Pas de note sur 100. Et on ne vous compare à personne — juste vous, et vos chiffres.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
