"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader } from "@/components/CompteEcranVide";
import { leconParId } from "@/lib/leconsArgent";

// Quiz d'une leçon — chantier "Leçons d'argent" du 25/07/2026. Progression
// en mémoire uniquement pour l'instant : pas de table Supabase, pas de
// suivi persistant d'avancement/badges (V1 volontairement minimale, comme
// "Mes démarches" Lot 1 — un futur lot pourra brancher une vraie
// persistance si la valeur se confirme). Chaque question cite sa source
// réelle (recherches Perplexity du 25/07/2026), affichée comme
// "consumerfinance.gov" l'est dans l'app de référence. Animations en pur
// CSS (retour CEO 25/07/2026 : "niveau US") — aucune librairie de
// gestes/animation dans le projet, cohérent avec MonAssistant.tsx.
const Ic = {
  Check: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  X:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Trophy:() => <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4a1 1 0 0 0-1 1 5 5 0 0 0 5 5M17 6h3a1 1 0 0 1 1 1 5 5 0 0 1-5 5"/></svg>,
};

const KEYFRAMES = `
  .tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}
  .tap:active{opacity:0.65;transform:scale(0.97)}
  @keyframes qEnter{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes choicePop{0%{transform:scale(1)}40%{transform:scale(1.035)}100%{transform:scale(1)}}
  @keyframes shakeX{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(5px)}60%{transform:translateX(-3px)}80%{transform:translateX(2px)}}
  @keyframes feedbackIn{from{opacity:0;transform:translateY(8px) scaleY(0.96)}to{opacity:1;transform:translateY(0) scaleY(1)}}
  @keyframes ctaIn{0%{transform:scale(0.97);opacity:0.6}60%{transform:scale(1.015)}100%{transform:scale(1);opacity:1}}
  @keyframes trophyIn{0%{transform:scale(0) rotate(-20deg);opacity:0}60%{transform:scale(1.15) rotate(6deg);opacity:1}100%{transform:scale(1) rotate(0deg);opacity:1}}
  @keyframes ringPulse{0%{box-shadow:0 0 0 0 rgba(245,166,35,0.45)}100%{box-shadow:0 0 0 22px rgba(245,166,35,0)}}
  @keyframes confettiOut{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(0.4);opacity:0}}
  @keyframes textIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
`;

const CONFETTI = [
  { dx: -70, dy: -60, color: "#F5A623", delay: 0 },
  { dx: 65, dy: -70, color: "#16A34A", delay: 0.05 },
  { dx: -80, dy: 20, color: "#4F46E5", delay: 0.1 },
  { dx: 80, dy: 10, color: "#E11D48", delay: 0.08 },
  { dx: -30, dy: -85, color: "#7C3AED", delay: 0.15 },
  { dx: 35, dy: -85, color: "#F5A623", delay: 0.12 },
  { dx: -60, dy: 60, color: "#22C55E", delay: 0.2 },
  { dx: 60, dy: 60, color: "#F5A623", delay: 0.18 },
];

export default function Page() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";
  const lecon = leconParId(id);

  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg    = isDark ? "#0A0A0F" : "#F2F2F7";
  const card2 = isDark ? "#2C2C2E" : "#EBEBF0";
  const t1    = isDark ? "#FFFFFF" : "#000000";
  const t2    = isDark ? "#8E8E93" : "#6C6C70";
  const t3    = isDark ? "#636366" : "#AEAEB2";

  const [index, setIndex] = useState(0);
  const [choix, setChoix] = useState<number | null>(null);
  const [termine, setTermine] = useState(false);

  if (!lecon) {
    return (
      <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
        <CompteHeader titre="Leçon" fondNeutre retourHref="/menu/lecons-argent"/>
        <div style={{ padding: "60px 20px", textAlign: "center", color: t3, fontSize: "14px", fontWeight: "600" }}>Cette leçon n&apos;existe pas.</div>
      </div>
    );
  }

  if (termine) {
    return (
      <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
        <style>{KEYFRAMES}</style>
        <CompteHeader titre={lecon.titre} fondNeutre retourHref="/menu/lecons-argent"/>
        <div style={{ padding: "60px 20px", textAlign: "center" }}>
          <div style={{ position: "relative", width: "72px", height: "72px", margin: "0 auto 20px" }}>
            {CONFETTI.map((c, i) => (
              <div key={i} style={{ position: "absolute", top: "50%", left: "50%", width: "7px", height: "7px", borderRadius: "2px", backgroundColor: c.color, "--dx": `${c.dx}px`, "--dy": `${c.dy}px`, animation: `confettiOut 0.9s ease-out ${c.delay}s both` } as React.CSSProperties}/>
            ))}
            <div style={{ position: "relative", width: "72px", height: "72px", borderRadius: "50%", backgroundColor: card2, display: "flex", alignItems: "center", justifyContent: "center", animation: "trophyIn 0.6s cubic-bezier(.34,1.56,.64,1) both, ringPulse 1.4s ease-out 0.6s" }}>
              {Ic.Trophy()}
            </div>
          </div>
          <div style={{ color: t1, fontSize: "19px", fontWeight: "800", marginBottom: "8px", animation: "textIn 0.4s ease 0.3s both" }}>Bravo, leçon terminée !</div>
          <div style={{ color: t2, fontSize: "14px", marginBottom: "28px", animation: "textIn 0.4s ease 0.4s both" }}>Vous avez terminé « {lecon.titre} ».</div>
          <Link href="/menu/lecons-argent" className="tap" style={{ display: "inline-block", padding: "14px 28px", borderRadius: "24px", backgroundColor: "#F5A623", color: "#080812", fontSize: "14px", fontWeight: "800", textDecoration: "none", animation: "textIn 0.4s ease 0.5s both" }}>Retour aux leçons</Link>
        </div>
      </div>
    );
  }

  const q = lecon.questions[index];
  const total = lecon.questions.length;
  const aRepondu = choix !== null;
  const correct = choix === q.reponseCorrecte;

  function suivant() {
    if (index + 1 < total) {
      setIndex(index + 1);
      setChoix(null);
    } else {
      setTermine(true);
    }
  }

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{KEYFRAMES}</style>
      <CompteHeader titre={lecon.titre} fondNeutre retourHref="/menu/lecons-argent"/>

      <div style={{ padding: "16px 16px 0", display: "flex", alignItems: "center", gap: "10px" }}>
        <div key={`pill-${index}`} style={{ flexShrink: 0, padding: "5px 12px", borderRadius: "14px", backgroundColor: "#F5A623", color: "#080812", fontSize: "12px", fontWeight: "800", animation: "choicePop 0.3s ease" }}>{index + 1}/{total}</div>
        <div style={{ flex: 1, height: "8px", borderRadius: "4px", backgroundColor: card2, overflow: "hidden" }}>
          <div style={{ width: `${((index + 1) / total) * 100}%`, height: "100%", backgroundColor: "#F5A623", borderRadius: "4px", transition: "width 0.4s cubic-bezier(.34,1.56,.64,1)" }}/>
        </div>
      </div>

      <div key={index} style={{ padding: "24px 16px 40px", flex: 1, animation: "qEnter 0.3s ease both" }}>
        <div style={{ color: t1, fontSize: "21px", fontWeight: "800", lineHeight: "1.35", marginBottom: "20px" }}>{q.question}</div>

        <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
          {q.choix.map((option, i) => {
            const estCorrecte = i === q.reponseCorrecte;
            const estChoisie = i === choix;
            // Pilule pleine, couleur vive (retour CEO 25/07/2026 : la
            // référence n'a ni bordure ni badge, juste un bloc de couleur
            // saturée et un texte gras — le style "carte blanche + bordure
            // + badge lettré" essayé avant était encore trop timide).
            let bg2 = "#F5A623", txt = "#080812";
            if (aRepondu) {
              if (estCorrecte) { bg2 = "#16A34A"; txt = "#fff"; }
              else if (estChoisie) { bg2 = "#E11D48"; txt = "#fff"; }
              else { bg2 = card2; txt = t3; }
            }
            const anim = estChoisie ? (correct ? "choicePop 0.3s ease" : "shakeX 0.4s ease") : undefined;
            return (
              <button
                key={i}
                onClick={() => !aRepondu && setChoix(i)}
                disabled={aRepondu}
                className={aRepondu ? "" : "tap"}
                style={{ textAlign: "left", padding: "12px 16px", borderRadius: "22px", backgroundColor: bg2, color: txt, border: "none", fontSize: "13.5px", fontWeight: "800", cursor: aRepondu ? "default" : "pointer", lineHeight: "1.35", transition: "background-color 0.25s ease, color 0.25s ease", animation: anim }}
              >
                {option}
              </button>
            );
          })}
        </div>

        {aRepondu && (
          <div style={{ marginTop: "18px", padding: "16px", borderRadius: "14px", backgroundColor: correct ? "#DCFCE7" : "#FFE4E6", transformOrigin: "top", animation: "feedbackIn 0.3s ease both" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
              <div style={{ width: "22px", height: "22px", borderRadius: "50%", backgroundColor: correct ? "#16A34A" : "#E11D48", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {correct ? Ic.Check() : Ic.X()}
              </div>
              <span style={{ color: correct ? "#166534" : "#9F1239", fontSize: "14.5px", fontWeight: "800" }}>{correct ? "Correct !" : "Pas tout à fait"}</span>
            </div>
            {!correct && (
              <div style={{ color: "#080812", fontSize: "13.5px", fontWeight: "700", marginBottom: "6px" }}>La bonne réponse : {q.choix[q.reponseCorrecte]}</div>
            )}
            <div style={{ color: "#080812", fontSize: "13.5px", lineHeight: "1.55", marginBottom: "10px" }}>{q.explication}</div>
            <a href={q.source.url} target="_blank" rel="noopener noreferrer" style={{ color: "#080812", fontSize: "12px", fontWeight: "700", textDecoration: "underline", opacity: 0.75 }}>
              Source : {q.source.label}
            </a>
          </div>
        )}
      </div>

      <div style={{ padding: "12px 16px calc(env(safe-area-inset-bottom) + 16px)" }}>
        <button
          key={aRepondu ? "on" : "off"}
          onClick={suivant}
          disabled={!aRepondu}
          className={aRepondu ? "tap" : ""}
          style={{ width: "100%", padding: "16px", borderRadius: "26px", border: "none", backgroundColor: aRepondu ? "#F5A623" : card2, color: aRepondu ? "#080812" : t3, fontSize: "15px", fontWeight: "800", cursor: aRepondu ? "pointer" : "default", transition: "background-color 0.25s ease, color 0.25s ease", animation: aRepondu ? "ctaIn 0.35s cubic-bezier(.34,1.56,.64,1)" : undefined }}
        >
          {index + 1 < total ? "Suivant" : "Terminer"}
        </button>
      </div>
    </div>
  );
}
