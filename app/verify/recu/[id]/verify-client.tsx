"use client";

import { useEffect, useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { DEVISE_LABEL } from "@/lib/devise";
import { YelenLogo } from "@/components/YelenLogo";

type Resultat =
  | { found: false }
  | {
      found: true;
      authentique: boolean;
      statut: string;
      receipt_id: string;
      montant: number;
      institution_nom: string;
      reference: string;
      date: string | null;
    };

const STATUT_LABEL: Record<string, string> = {
  disponible: "Paiement confirmé",
  consulte: "Paiement confirmé",
  telecharge: "Paiement confirmé",
  verifie: "Paiement confirmé",
  archive: "Annulé après confirmation",
};

// Lot E — page publique de vérification (aucune authentification, ouverte
// par n'importe qui via le QR imprimé sur le reçu). Aucune donnée
// personnelle affichée (pas de nom/téléphone/photo du citoyen) — seulement
// de quoi confirmer l'authenticité, conformément à la décision CEO.
//
// POC i18n (08/08/2026) : établit le pattern de formatage date/devise via
// useFormatter() (next-intl) à la place de toLocaleDateString/toLocaleString
// codés en dur sur "fr-FR" — reste de l'écran volontairement pas migré
// (établir le pattern, pas une réécriture complète, voir CLAUDE.md
// /migration-i18n). lib/calculateurs.ts::formatGNF et
// lib/depenses.ts::formatGNF, utilisés ailleurs, ne sont pas touchés.
export function VerifyRecuClient({ id }: { id: string }) {
  const t = useTranslations("payments.receiptVerification");
  const format = useFormatter();
  const [loading, setLoading] = useState(true);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/verify/recu/${id}`);
        const json = await res.json().catch(() => null);
        if (!res.ok) { setErreur(json?.error || "Erreur lors de la vérification."); setLoading(false); return; }
        setResultat(json);
      } catch {
        setErreur("Erreur réseau.");
      }
      setLoading(false);
    })();
  }, [id]);

  const gold = "#F5A623";
  const green = "#1DAA61";
  const red = "#ef4444";
  const dark = "#111111";
  const muted = "#6C6C70";

  function formatPrix(p: number): string {
    return format.number(Math.round(p)) + " " + DEVISE_LABEL;
  }

  function formatDateHeure(iso: string | null): { date: string; heure: string } {
    if (!iso) return { date: "—", heure: "—" };
    const d = new Date(iso);
    if (isNaN(d.getTime())) return { date: iso, heure: "—" };
    return {
      date: format.dateTime(d, { day: "numeric", month: "long", year: "numeric" }),
      heure: format.dateTime(d, { hour: "2-digit", minute: "2-digit" }),
    };
  }

  return (
    <div style={{ minHeight: "100svh", backgroundColor: "#F2F2F7", fontFamily: "-apple-system,BlinkMacSystemFont,sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: "420px", backgroundColor: "#fff", borderRadius: "24px", padding: "32px 28px", boxShadow: "0 8px 40px rgba(0,0,0,0.08)", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "24px" }}>
          {/* Vraie icône Yelen (composant partagé components/YelenLogo.tsx,
              même traitement que app/institution/connexion/page.tsx : soleil
              foncé sur fond doré plat) — remplace un "Y" texte inventé qui
              ne correspondait à aucune marque réelle de l'app. */}
          <div style={{ width: "24px", height: "24px", borderRadius: "7px", backgroundColor: gold, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <YelenLogo size={13} color={dark}/>
          </div>
          <span style={{ color: dark, fontWeight: 800, fontSize: "15px" }}>Yelen</span>
        </div>

        {loading && (
          <div style={{ color: muted, fontSize: "13px", padding: "20px 0" }}>Vérification en cours…</div>
        )}

        {!loading && erreur && (
          <div style={{ color: red, fontSize: "13px", padding: "20px 0" }}>{erreur}</div>
        )}

        {!loading && !erreur && resultat && !resultat.found && (
          <>
            <div style={{ width: "56px", height: "56px", borderRadius: "50%", backgroundColor: "rgba(142,142,147,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <div style={{ color: dark, fontSize: "16px", fontWeight: 800, marginBottom: "6px" }}>Reçu introuvable</div>
            <div style={{ color: muted, fontSize: "12.5px", lineHeight: 1.5 }}>Ce lien ou ce code ne correspond à aucun reçu Yelen.</div>
          </>
        )}

        {!loading && !erreur && resultat && resultat.found && (
          <>
            <div style={{ width: "56px", height: "56px", borderRadius: "50%", backgroundColor: resultat.authentique ? "rgba(29,170,97,0.12)" : "rgba(245,166,35,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={resultat.authentique ? green : gold} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style={{ color: resultat.authentique ? green : gold, fontSize: "17px", fontWeight: 900, marginBottom: "4px" }}>Reçu authentique</div>
            <div style={{ color: muted, fontSize: "12.5px", marginBottom: "24px" }}>{STATUT_LABEL[resultat.statut] ?? resultat.statut}</div>

            <div style={{ textAlign: "left", backgroundColor: "#F2F2F7", borderRadius: "14px", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {[
                [t("fields.institution"), resultat.institution_nom],
                [t("fields.amount"), formatPrix(resultat.montant)],
                [t("fields.date"), formatDateHeure(resultat.date).date],
                ["Heure", formatDateHeure(resultat.date).heure],
                ["Référence", resultat.reference || "—"],
              ].map(([label, valeur]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: muted, fontSize: "12px" }}>{label}</span>
                  <span style={{ color: dark, fontSize: "13px", fontWeight: 700 }}>{valeur}</span>
                </div>
              ))}
            </div>

            <div style={{ color: muted, fontSize: "10.5px", marginTop: "18px" }}>Receipt ID {resultat.receipt_id}</div>
          </>
        )}
      </div>
    </div>
  );
}
