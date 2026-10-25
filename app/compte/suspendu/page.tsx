"use client";

// Écran "compte suspendu pour inactivité" (chantier COMPTES-INACTIFS.md,
// Phase 3, sections 2.7/2.11.5) — atteint uniquement via
// components/SuspensionInactiviteCitoyenGate.tsx. Contrairement à
// RdvRestrictionScreen (qui ne bloque que la fonctionnalité RDV), ceci
// bloque l'accès au compte entier — raison du ton volontairement
// rassurant (jamais accusateur, jamais le mot "inactivité" présenté comme
// une faute) et de l'accès au support toujours ouvert.
//
// Réactivation : jamais un simple bouton qui ferait confiance à la session
// déjà ouverte (ce serait une lecture passive, pas une preuve d'activité
// récente) — "Se reconnecter" déconnecte explicitement puis renvoie vers
// /login, qui déclenche un vrai supabase.auth.verifyOtp() frais ; c'est ce
// moment précis (app/login/page.tsx -> /api/citoyen/auth/touch-login) qui
// lève la suspension, pas le chargement de cette page.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { YelenLoader } from "@/components/YelenLoader";
import { logoutCitoyenStrict } from "@/lib/auth/logoutCitoyen";

export default function CompteSuspenduPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const C = T[theme];

  const [checked, setChecked] = useState(false);
  const [suspendu, setSuspendu] = useState(false);
  const [deconnexion, setDeconnexion] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { router.replace("/login"); return; }
      try {
        const res = await fetch("/api/citoyen/compte/suspension-inactivite", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json().catch(() => null);
        setSuspendu(!!json?.suspended);
      } catch {}
      setChecked(true);
    })();
  }, [router]);

  // Suspension levée entre l'envoi de la notification et l'ouverture de
  // cet écran (ex. réactivation déjà déclenchée par une autre action
  // qualifiante entre temps) — jamais un écran figé qui mentirait sur
  // l'état réel du compte.
  useEffect(() => {
    if (checked && !suspendu) router.replace("/");
  }, [checked, suspendu, router]);

  async function seReconnecter() {
    setDeconnexion(true);
    try {
      await logoutCitoyenStrict();
    } catch {}
    router.push("/login");
  }

  if (!checked || !suspendu) {
    return (
      <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <YelenLoader size={44} label="Chargement…" labelColor={C.textSubtle}/>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: C.pageBg, overflowY: "auto", zIndex: 1000 }}>
      <div style={{ maxWidth: "480px", margin: "0 auto", padding: "40px 20px 60px" }}>
        <div style={{ color: "#F5A623", fontSize: "12px", fontWeight: "800", letterSpacing: "0.5px", marginBottom: "10px" }}>
          VOTRE COMPTE
        </div>
        <h1 style={{ color: C.text, fontSize: "22px", fontWeight: "800", marginBottom: "16px" }}>
          Votre compte Yelen est en pause
        </h1>
        <p style={{ color: C.textSubtle, fontSize: "14px", lineHeight: "1.6", marginBottom: "20px" }}>
          Nous n&apos;avons détecté aucune connexion ni action depuis un certain temps, alors nous avons mis votre
          compte en pause par mesure de sécurité — une pratique courante, pas une sanction.
        </p>
        <div style={{ backgroundColor: C.cardBg, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px", marginBottom: "20px" }}>
          <div style={{ color: C.text, fontSize: "13px", fontWeight: "700", marginBottom: "6px" }}>
            Rien n&apos;a été supprimé
          </div>
          <div style={{ color: C.textSubtle, fontSize: "13px", lineHeight: "1.6" }}>
            Vos rendez-vous, paiements, reçus et documents restent intacts et inchangés. Une simple reconnexion
            réactive immédiatement votre compte.
          </div>
        </div>
        <button
          onClick={seReconnecter}
          disabled={deconnexion}
          style={{
            width: "100%", padding: "14px", backgroundColor: "#F5A623", border: "none", borderRadius: "12px",
            color: "#000", fontSize: "14px", fontWeight: "800", cursor: deconnexion ? "default" : "pointer",
            opacity: deconnexion ? 0.7 : 1, marginBottom: "12px",
          }}
        >
          {deconnexion ? "Redirection…" : "Se reconnecter pour réactiver mon compte"}
        </button>
        <a
          href="/compte/feedback"
          style={{
            display: "block", textAlign: "center", padding: "12px", color: C.textSubtle, fontSize: "13px",
            fontWeight: "600", textDecoration: "none",
          }}
        >
          Besoin d&apos;aide ? Contacter le support
        </a>
      </div>
    </div>
  );
}
