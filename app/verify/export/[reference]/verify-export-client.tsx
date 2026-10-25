"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { YelenLogo } from "@/components/YelenLogo";
import { base64urlVersHex } from "@/lib/export/empreinteUrl";

// Texte de limite imposé (identique à lib/export/verificationPublique.ts, qui
// importe `crypto` et ne peut donc pas être chargé dans le navigateur).
const TEXTE_LIMITE =
  "Cette vérification confirme l'enregistrement du document par Yelen224. Elle ne garantit pas, à elle seule, que le contenu du fichier est resté inchangé.";

type DocumentVerifie = { reference: string; type: string; etablissement: string; date: string; nb_lignes: number; version_gabarit: string };
type Etat =
  | { k: "saisie" }
  | { k: "chargement" }
  | { k: "verifie"; doc: DocumentVerifie }
  | { k: "non" }
  | { k: "limite" }
  | { k: "indisponible" };

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const REGEX_EMPREINTE = /^[0-9a-f]{64}$/i;

export function VerifyExportClient({ reference }: { reference: string }) {
  const { theme } = useTheme();
  const sombre = theme === "dark";
  const c = sombre
    ? { fond: "#0A0A0F", carte: "#111118", champ: "#1C1C28", bord: "rgba(255,255,255,0.12)", t1: "#FFFFFF", t2: "#B4B4CC", vert: "#00C896", rouge: "#FF6B78", or: "#F5A623" }
    : { fond: "#F2F2F7", carte: "#FFFFFF", champ: "#F5F5F8", bord: "rgba(10,10,18,0.14)", t1: "#0A0A12", t2: "#47475C", vert: "#00966F", rouge: "#B3202F", or: "#B87D1A" };

  const idChamp = useId();
  const idErreur = useId();
  const [etat, setEtat] = useState<Etat>({ k: "saisie" });
  const [saisie, setSaisie] = useState("");
  const [erreurSaisie, setErreurSaisie] = useState<string | null>(null);
  const refTitreResultat = useRef<HTMLHeadingElement>(null);
  const demarre = useRef(false);

  const verifier = useCallback(async (empreinte: string) => {
    setEtat({ k: "chargement" });
    try {
      const res = await fetch("/api/verify/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, empreinte }),
      });
      if (res.status === 429) { setEtat({ k: "limite" }); return; }
      if (!res.ok) { setEtat({ k: "indisponible" }); return; }
      const j: unknown = await res.json().catch(() => null);
      const r = j as (DocumentVerifie & { verifie?: boolean }) | null;
      if (r && r.verifie === true) {
        setEtat({ k: "verifie", doc: { reference: r.reference, type: r.type, etablissement: r.etablissement, date: r.date, nb_lignes: r.nb_lignes, version_gabarit: r.version_gabarit } });
      } else {
        setEtat({ k: "non" });
      }
    } catch {
      setEtat({ k: "indisponible" });
    }
  }, [reference]);

  // Lien du QR : l'empreinte est dans le fragment (#e=…), jamais envoyé au
  // serveur. On le lit, on lance la vérification, puis on l'efface de la barre
  // d'adresse.
  useEffect(() => {
    if (demarre.current) return;
    demarre.current = true;
    const m = /^#e=([A-Za-z0-9_-]+)$/.exec(window.location.hash);
    if (!m) return;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    const hex = base64urlVersHex(m[1]);
    if (hex) void verifier(hex);
    else setEtat({ k: "non" });
  }, [verifier]);

  // Le résultat reçoit le focus (lecteurs d'écran, clavier).
  useEffect(() => {
    if (etat.k !== "saisie" && etat.k !== "chargement") refTitreResultat.current?.focus();
  }, [etat.k]);

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
    const propre = saisie.replace(/\s+/g, "");
    if (!REGEX_EMPREINTE.test(propre)) {
      setErreurSaisie("L'empreinte comporte 64 caractères hexadécimaux (0 à 9 et a à f).");
      return;
    }
    setErreurSaisie(null);
    void verifier(propre);
  }

  function recommencer() {
    setSaisie("");
    setErreurSaisie(null);
    setEtat({ k: "saisie" });
  }

  const referenceAffichee = reference.length > 40 ? `${reference.slice(0, 40)}…` : reference;
  const titreStyle = { color: c.t1, fontSize: "20px", fontWeight: 600, margin: "0 0 6px", outline: "none" } as const;
  const boutonPrimaire = { height: "44px", padding: "0 20px", borderRadius: "10px", border: "none", backgroundColor: "#F5A623", color: "#111111", fontSize: "14px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", width: "100%" } as const;
  const boutonSecondaire = { height: "44px", padding: "0 20px", borderRadius: "10px", border: `1px solid ${c.bord}`, backgroundColor: "transparent", color: c.t1, fontSize: "14px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", width: "100%" } as const;

  return (
    <main style={{ minHeight: "100svh", backgroundColor: c.fond, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <style>{`
        .vx-focus:focus-visible{outline:2px solid #F5A623;outline-offset:2px}
        @media (prefers-reduced-motion:reduce){.vx-carte{animation:none !important}}
      `}</style>
      <div className="vx-carte" style={{ width: "100%", maxWidth: "460px", backgroundColor: c.carte, border: `1px solid ${c.bord}`, borderRadius: "20px", padding: "28px 24px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
          <div aria-hidden="true" style={{ width: "24px", height: "24px", borderRadius: "7px", backgroundColor: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <YelenLogo size={13} color="#111111"/>
          </div>
          <span style={{ color: c.t1, fontWeight: 700, fontSize: "15px" }}>Yelen224</span>
        </div>

        {(etat.k === "saisie" || etat.k === "chargement") && (
          <>
            <h1 ref={refTitreResultat} tabIndex={-1} style={titreStyle}>Vérification d&apos;un document</h1>
            <p style={{ color: c.t2, fontSize: "13px", lineHeight: 1.6, margin: "0 0 4px" }}>Référence du document</p>
            <p style={{ color: c.t1, fontFamily: MONO, fontSize: "13px", margin: "0 0 18px", overflowWrap: "anywhere" }}>{referenceAffichee}</p>

            {etat.k === "chargement" ? (
              <p role="status" style={{ color: c.t2, fontSize: "13px", margin: 0 }}>Vérification en cours…</p>
            ) : (
              <form onSubmit={soumettre} noValidate>
                <label htmlFor={idChamp} style={{ display: "block", color: c.t1, fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                  Empreinte SHA-256 indiquée sur votre document
                </label>
                <input
                  id={idChamp} type="text" value={saisie} onChange={e => setSaisie(e.target.value)}
                  spellCheck={false} autoComplete="off" autoCapitalize="off" placeholder="64 caractères hexadécimaux"
                  aria-invalid={erreurSaisie ? true : undefined} aria-describedby={erreurSaisie ? idErreur : undefined}
                  className="vx-focus"
                  style={{ width: "100%", boxSizing: "border-box", height: "44px", borderRadius: "10px", border: `1px solid ${erreurSaisie ? c.rouge : c.bord}`, backgroundColor: c.champ, color: c.t1, padding: "0 12px", fontFamily: MONO, fontSize: "13px" }}
                />
                {erreurSaisie && <p id={idErreur} role="alert" style={{ color: c.rouge, fontSize: "12.5px", margin: "6px 0 0" }}>{erreurSaisie}</p>}
                <div style={{ marginTop: "16px" }}>
                  <button type="submit" className="vx-focus" style={boutonPrimaire}>Vérifier</button>
                </div>
              </form>
            )}
          </>
        )}

        {etat.k === "verifie" && (
          <div role="status">
            <div aria-hidden="true" style={{ width: "48px", height: "48px", borderRadius: "50%", backgroundColor: `${c.vert}22`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c.vert} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h1 ref={refTitreResultat} tabIndex={-1} style={titreStyle}>Concordance confirmée</h1>
            <p style={{ color: c.t2, fontSize: "13px", lineHeight: 1.6, margin: "0 0 16px" }}>
              Cette référence et cette empreinte correspondent à un export enregistré par Yelen224.
            </p>
            <dl style={{ margin: 0, backgroundColor: c.champ, borderRadius: "12px", padding: "4px 14px" }}>
              {([
                ["Référence", etat.doc.reference, true],
                ["Type de document", etat.doc.type, false],
                ["Établissement", etat.doc.etablissement, false],
                ["Généré le (heure de Conakry)", etat.doc.date, false],
                ["Nombre de lignes", String(etat.doc.nb_lignes), false],
                ["Version du gabarit", etat.doc.version_gabarit, false],
              ] as const).map(([label, valeur, mono], i, tout) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: "16px", padding: "10px 0", borderBottom: i < tout.length - 1 ? `1px solid ${c.bord}` : "none" }}>
                  <dt style={{ color: c.t2, fontSize: "12.5px", flexShrink: 0 }}>{label}</dt>
                  <dd style={{ margin: 0, color: c.t1, fontSize: "13px", fontWeight: 600, textAlign: "right", overflowWrap: "anywhere", fontFamily: mono ? MONO : "inherit" }}>{valeur}</dd>
                </div>
              ))}
            </dl>
            <p style={{ color: c.t2, fontSize: "12.5px", lineHeight: 1.6, margin: "16px 0 0" }}>{TEXTE_LIMITE}</p>
            <div style={{ marginTop: "16px" }}>
              <button type="button" onClick={recommencer} className="vx-focus" style={boutonSecondaire}>Vérifier un autre document</button>
            </div>
          </div>
        )}

        {etat.k === "non" && (
          <div role="status">
            <h1 ref={refTitreResultat} tabIndex={-1} style={titreStyle}>Aucune concordance</h1>
            <p style={{ color: c.t2, fontSize: "13px", lineHeight: 1.6, margin: "0 0 16px" }}>
              Cette référence et cette empreinte ne correspondent à aucun export enregistré par Yelen224. Vérifiez l&apos;empreinte indiquée sur votre document, puis réessayez.
            </p>
            <button type="button" onClick={recommencer} className="vx-focus" style={boutonSecondaire}>Réessayer</button>
          </div>
        )}

        {etat.k === "limite" && (
          <div role="alert">
            <h1 ref={refTitreResultat} tabIndex={-1} style={titreStyle}>Trop de tentatives</h1>
            <p style={{ color: c.t2, fontSize: "13px", lineHeight: 1.6, margin: "0 0 16px" }}>
              Patientez quelques minutes avant de réessayer.
            </p>
            <button type="button" onClick={recommencer} className="vx-focus" style={boutonSecondaire}>Retour</button>
          </div>
        )}

        {etat.k === "indisponible" && (
          <div role="alert">
            <h1 ref={refTitreResultat} tabIndex={-1} style={titreStyle}>Vérification indisponible</h1>
            <p style={{ color: c.t2, fontSize: "13px", lineHeight: 1.6, margin: "0 0 16px" }}>
              La vérification est momentanément indisponible. Réessayez plus tard.
            </p>
            <button type="button" onClick={recommencer} className="vx-focus" style={boutonSecondaire}>Retour</button>
          </div>
        )}
      </div>
    </main>
  );
}
