"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";

// Transition entre "compte créé" et les questions optionnelles
// (Usage/Attentes/Acquisition) — chantier Onboarding Phase 2/3,
// 11/09/2026. Décision Bryan : CTA à taper, pas d'auto-avance.
export default function PremiersPasPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg = isDark ? "#0A0A0F" : "#F2F2F7";
  const t1 = isDark ? "#FFFFFF" : "#000000";
  const t2 = isDark ? "#8E8E93" : "#6C6C70";

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`
        .tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}
        .tap:active{opacity:0.65;transform:scale(0.97)}
        @keyframes ppIconIn{0%{transform:scale(0) rotate(-20deg);opacity:0}60%{transform:scale(1.15) rotate(6deg);opacity:1}100%{transform:scale(1) rotate(0deg);opacity:1}}
        @keyframes ppTextIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      `}</style>
      <div style={{ textAlign: "center", maxWidth: "360px", width: "100%" }}>
        <div style={{ width: "200px", margin: "0 auto 20px", animation: "ppIconIn 0.6s cubic-bezier(.34,1.56,.64,1) both" }}>
          <Image src="/illustrations/premiers-pas-bienvenue.png" alt="Bienvenue sur Yelen" width={1536} height={1024} style={{ width: "100%", height: "auto", display: "block" }} priority/>
        </div>
        <h1 style={{ color: t1, fontSize: "22px", fontWeight: "900", margin: "0 0 10px", letterSpacing: "-0.5px", animation: "ppTextIn 0.4s ease 0.2s both" }}>Bienvenue chez Yelen</h1>
        <p style={{ color: t2, fontSize: "13.5px", lineHeight: 1.7, margin: "0 0 28px", animation: "ppTextIn 0.4s ease 0.28s both" }}>
          Votre compte est prêt. Encore quelques questions facultatives pour que Yelen s&apos;adapte à vous — ça ne prend qu&apos;une minute.
        </p>
        <button onClick={() => router.push("/premiers-pas/centres-interet")} className="tap" style={{ width: "100%", padding: "15px", borderRadius: "16px", background: "#F5A623", border: "none", color: "#080812", fontWeight: "800", fontSize: "15px", cursor: "pointer", animation: "ppTextIn 0.4s ease 0.34s both" }}>
          Continuer →
        </button>
      </div>
    </div>
  );
}
