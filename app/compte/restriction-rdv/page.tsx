"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { YelenLoader } from "@/components/YelenLoader";
import { EcranContenuIntrouvable } from "@/components/EcranContenuIntrouvable";
import { RdvRestrictionScreen, type RdvRestrictionData } from "@/components/RdvRestrictionScreen";

// Cible du CTA "En savoir plus" des notifications rdv_restriction_7j/30j/clos
// (voir lib/notificationContent.tsx::resoudreCta) — seul point d'entrée
// standalone vers RdvRestrictionScreen, jusqu'ici monté uniquement à
// l'intérieur du wizard de réservation (app/rdv/[id]/page.tsx). Même source
// de vérité (GET /api/citoyen/rdv-restriction), même logique de chargement,
// sans dépendance à une institution précise.
export default function RestrictionRdvPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const C = T[theme];

  const [checked, setChecked] = useState(false);
  const [restriction, setRestriction] = useState<RdvRestrictionData | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      let userId: string | null = null;
      try { userId = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
      if (!userId?.trim()) {
        router.replace(`/inscription?redirect=${encodeURIComponent("/compte/restriction-rdv")}`);
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setChecked(true); return; }
      setAccessToken(session.access_token);
      try {
        const res = await fetch("/api/citoyen/rdv-restriction", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const json = await res.json().catch(() => null);
        if (json?.restricted) {
          setRestriction({
            reference: json.reference, niveau: json.niveau, absencesTotal: json.absencesTotal,
            jusquAu: json.jusquAu, rendezVousConcernes: json.rendezVousConcernes ?? [], appel: json.appel ?? null,
          });
        }
      } catch {}
      setChecked(true);
    })();
  }, [router]);

  if (!checked) return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <YelenLoader size={44} label="Chargement…" labelColor={C.textSubtle}/>
    </div>
  );

  // Restriction expirée/levée entre l'envoi de la notification et l'ouverture
  // de l'écran (auto-réactivation, appel accepté) — jamais une page blanche
  // ni un message qui supposerait encore une restriction active.
  if (!restriction || !accessToken) return (
    <EcranContenuIntrouvable
      pageBg={C.pageBg} text={C.text} textSubtle={C.textSubtle} border={C.border} isDark={isDark}
      eyebrow="RENDEZ-VOUS"
      title="Aucune restriction active"
      message="Votre accès à la prise de rendez-vous est disponible normalement."
      primaryHref="/" primaryLabel="Retour à l'accueil"
    />
  );

  return (
    <RdvRestrictionScreen
      C={C} isDark={isDark} data={restriction} accessToken={accessToken}
      onClose={() => router.push("/")}
      onAppelEnvoye={(appel) => setRestriction((r) => (r ? { ...r, appel } : r))}
    />
  );
}
