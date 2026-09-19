"use client";

// Modale QR "Mon Yelen ID" — extraite de app/compte/carte-yelen/carte-yelen-client.tsx
// (24/08/2026, retour Bryan : réutiliser le même QR plein écran depuis
// "Mon QR Code"), puis refondue (24/08/2026, retour Bryan : "organise le
// qr like whatsapp ici exacte") sur le modèle exact de la carte de partage
// QR de WhatsApp — fond noir plein écran, carte blanche arrondie, avatar
// du compte à cheval sur le bord supérieur de la carte, nom + sous-titre,
// QR centré dans la carte, légende en dessous sur fond noir. Le logo au
// centre du QR (badge orange, soleil Yelen) est déjà le vrai logo officiel
// (lib/qrBrand.ts::yelenLogoBadgeDataUrl, tracé identique à
// components/YelenLogo.tsx) — inchangé, juste mis en valeur par la
// nouvelle mise en page. Payload statique YELEN-ID:{id} généré 100% côté
// client — différent des QR de RDV (app/mon-qr/page.tsx), qui eux passent
// par /api/qr/generate et sont chiffrés/expirables. Auto-suffisante : lit
// YELEN224_USER_ID_KEY et le profil elle-même, aucune prop obligatoire
// au-delà de onClose.
import { useEffect, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { formatYelenId } from "@/lib/citoyenIdentite";
import { generateBrandedQR } from "@/lib/qrBrand";

type Profil = { prenom: string | null; nom: string | null; photo_url: string | null };

export function YelenIdQrModal({ onClose }: { onClose: () => void }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    try { setUserId(localStorage.getItem(YELEN224_USER_ID_KEY)); } catch { setUserId(null); }
  }, []);

  useEffect(() => {
    if (!userId) return;
    void supabase.from("users").select("prenom,nom,photo_url").eq("id", userId).maybeSingle()
      .then(({ data }) => { if (data) setProfil(data as Profil); });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    setQrLoading(true);
    setQrDataUrl(null);
    setError(false);
    void (async () => {
      try {
        const url = await generateBrandedQR(`YELEN-ID:${formatYelenId(userId)}`, 600);
        setQrDataUrl(url);
      } catch {
        setError(true);
      } finally {
        setQrLoading(false);
      }
    })();
  }, [userId]);

  const yelenId = userId ? formatYelenId(userId) : "YL-????-????";
  const nomComplet = `${profil?.prenom ?? ""} ${profil?.nom ?? ""}`.trim() || "Citoyen Yelen";
  const initiales = ((profil?.prenom?.[0] ?? "") + (profil?.nom?.[0] ?? "")).toUpperCase() || "Y";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, backgroundColor: "#000", display: "flex", flexDirection: "column" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } .tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}.tap:active{opacity:0.65;transform:scale(0.97)}`}</style>

      <button onClick={onClose} aria-label="Fermer" className="tap" style={{ position: "absolute", top: "calc(16px + env(safe-area-inset-top))", right: "16px", zIndex: 2, background: "rgba(255,255,255,0.12)", border: "none", borderRadius: "50%", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", cursor: "pointer" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>

      <div style={{ flex: 1, overflow: "auto", padding: "calc(64px + env(safe-area-inset-top)) 24px 32px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        {error ? (
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px", textAlign: "center" }}>Impossible de générer le QR Code. Réessayez plus tard.</div>
        ) : (
          <div style={{ width: "100%", maxWidth: "300px" }}>
            {/* Avatar du compte à cheval sur le bord de la carte — même
                principe que la photo de profil sur la carte de partage
                WhatsApp. */}
            <div style={{ display: "flex", justifyContent: "center", position: "relative", zIndex: 1, marginBottom: "-34px" }}>
              {profil?.photo_url ? (
                <div style={{ position: "relative", width: "68px", height: "68px", borderRadius: "50%", overflow: "hidden", border: "3px solid #000", flexShrink: 0 }}>
                  <Image src={profil.photo_url} alt="" fill sizes="68px" style={{ objectFit: "cover" }} />
                </div>
              ) : (
                <div style={{ width: "68px", height: "68px", borderRadius: "50%", background: "linear-gradient(135deg,#F5A623,#C8940A)", border: "3px solid #000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", fontWeight: "900", color: "#080812", flexShrink: 0 }}>{initiales}</div>
              )}
            </div>

            <div style={{ backgroundColor: "#fff", borderRadius: "20px", padding: "42px 24px 28px", textAlign: "center" }}>
              <div style={{ color: "#080812", fontSize: "18px", fontWeight: "800" }}>{nomComplet}</div>
              <div style={{ color: "#8E8E93", fontSize: "12.5px", fontWeight: "600", marginBottom: "22px" }}>Compte citoyen Yelen</div>

              {qrLoading || !qrDataUrl ? (
                <div style={{ width: "220px", height: "220px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", animation: "spin 1s linear infinite" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                  </div>
                </div>
              ) : (
                // IMG-EXCEPTION: reason=data URL base64 générée localement (QRCode), non fetchable par l'optimiseur next/image | reviewed=2026-08-24
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt="QR Code Yelen ID" width="220" height="220" style={{ display: "block", margin: "0 auto" }} />
              )}
            </div>

            {!qrLoading && qrDataUrl && (
              <div style={{ textAlign: "center", marginTop: "22px" }}>
                <div style={{ fontFamily: "monospace", fontSize: "15px", fontWeight: "800", color: "#F5A623", letterSpacing: "1px", marginBottom: "8px" }}>{yelenId}</div>
                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "12.5px", lineHeight: 1.6 }}>
                  Scannez ce code pour identifier {profil ? nomComplet : "ce compte"} sur Yelen.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
