"use client";

import React from "react";
import { useState } from "react";
import { Sora } from "next/font/google";

// Auto-hébergée (Lot 1.5, 13/08/2026) — voir app/ambassades/page.tsx pour
// le raisonnement complet.
// Sora ne propose pas de graisse 900 statique (confirmé dans les types
// next/font/google) — l'ancien @import la demandait déjà en vain, le
// navigateur retombait silencieusement sur 800 (algorithme de matching de
// graisse CSS standard). Comportement visuel strictement identique.
const sora = Sora({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-sora" });

// ── Data ─────────────────────────────────────────────────────────────────────
const FORM_TYPES = [
  { id: "general",     label: "Contact général",          icon: "✉️",  desc: "Question, suggestion, info" },
  { id: "institution", label: "Institution / Partenariat", icon: "🏛️", desc: "Rejoindre Yelen224" },
  { id: "presse",      label: "Presse / Média",            icon: "📰", desc: "Interview ou demande journalistique" },
  { id: "support",     label: "Support technique",         icon: "🛠️", desc: "Bug ou problème sur la plateforme" },
];

const SIEGES = [
  { pays: "États-Unis", flag: "🇺🇸", titre: "New York (Bronx)", adresse: "1895 Morris Avenue, 5ème étage", tel: "+1 347 301 6768", color: "#3b82f6" },
  { pays: "Guinée",     flag: "🇬🇳", titre: "Conakry",          adresse: "Cimenterie, Commune de Ratoma, 3ème étage", tel: "+224 624 35 46 00", color: "#F5A623" },
];

// ── Shared input style ────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: "100%",
  padding: "13px 16px",
  borderRadius: "14px",
  border: "1.5px solid rgba(200,140,0,0.22)",
  background: "rgba(255,255,255,0.72)",
  backdropFilter: "blur(8px)",
  color: "#1a1200",
  fontSize: "14px",
  fontFamily: "var(--font-sora), sans-serif",
  fontWeight: "500",
  outline: "none",
  boxSizing: "border-box",
  WebkitAppearance: "none",
};

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ContactPage() {
  const [activeForm, setActiveForm] = useState("general");
  const [formData, setFormData] = useState({
    nom: "", prenom: "", email: "", telephone: "",
    organisation: "", sujet: "", message: "",
    nomInstitution: "", typeInstitution: "", ville: "", pays: "",
    media: "", publication: "",
    typeProbleme: "", urlPage: "",
  });
  const [status, setStatus] = useState("idle");
  const [honeypot, setHoneypot] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (honeypot) return;
    setStatus("sending");
    try {
      const res = await fetch("https://formsubmit.co/ajax/yelen224gn@gmail.com", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          ...formData,
          _subject: `[Yelen224] ${FORM_TYPES.find(f => f.id === activeForm)?.label} — ${formData.sujet || formData.nom}`,
          _template: "table",
          _captcha: "false",
          typeFormulaire: FORM_TYPES.find(f => f.id === activeForm)?.label,
        }),
      });
      if (res.ok) {
        setStatus("success");
        setFormData({ nom:"",prenom:"",email:"",telephone:"",organisation:"",sujet:"",message:"",nomInstitution:"",typeInstitution:"",ville:"",pays:"",media:"",publication:"",typeProbleme:"",urlPage:"" });
      } else setStatus("error");
    } catch { setStatus("error"); }
  };

  const currentType = FORM_TYPES.find(f => f.id === activeForm);

  return (
    <div className={sora.variable} style={{ minHeight: "100vh", background: "linear-gradient(160deg, #FFF3CC 0%, #FFE680 35%, #FFDA40 65%, #FFF0B3 100%)", fontFamily: "var(--font-sora), sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { margin: 0; }
        ::-webkit-scrollbar { display: none; }
        input::placeholder, textarea::placeholder { color: rgba(140,100,0,0.4); }
        input:focus, textarea:focus, select:focus { outline: none; border-color: #F5A623 !important; box-shadow: 0 0 0 3px rgba(245,166,35,0.18) !important; }
        select option { background: #fffbe6; color: #1a1200; }
        .hp-field { opacity:0; position:absolute; top:0; left:0; height:0; width:0; z-index:-1; pointer-events:none; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
        .fade-up { animation: fadeUp 0.32s cubic-bezier(0.16,1,0.3,1) forwards; }
      `}</style>

      <div style={{ height: "env(safe-area-inset-top, 0px)" }} />

      {/* ── Top bar ── */}
      <div style={{ padding: "24px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(245,166,35,0.4)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a1200" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: "900", color: "#1a1200", letterSpacing: "0.5px", lineHeight: 1 }}>YELEN<span style={{ color: "#c47a00" }}>224</span></div>
            <div style={{ fontSize: "8px", color: "#8B6914", letterSpacing: "1.5px", fontWeight: "600" }}>NOUS CONTACTER</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: "20px", padding: "5px 12px" }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e" }} />
          <span style={{ color: "#15803d", fontSize: "10px", fontWeight: "700" }}>Disponible</span>
        </div>
      </div>

      {/* ── Hero ── */}
      <div style={{ padding: "24px 20px 20px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: "900", color: "#1a1200", margin: "0 0 6px", letterSpacing: "-0.8px", lineHeight: 1.1 }}>
          Contactez<br /><span style={{ color: "#c47a00" }}>Yelen224</span>
        </h1>
        <p style={{ color: "#6b5000", fontSize: "13px", margin: 0, lineHeight: 1.6 }}>
          Notre équipe répond sous 24–48h ouvrées depuis Conakry et New York.
        </p>
      </div>

      {/* ── Sièges horizontaux ── */}
      <div style={{ overflowX: "auto", paddingLeft: "20px", paddingBottom: "4px", display: "flex", gap: "12px", scrollbarWidth: "none", marginBottom: "24px" }}>
        {SIEGES.map(s => (
          <div key={s.pays} style={{
            flexShrink: 0, width: "220px",
            background: "rgba(255,255,255,0.72)",
            backdropFilter: "blur(12px)",
            border: `1.5px solid rgba(255,255,255,0.9)`,
            borderLeft: `3px solid ${s.color}`,
            borderRadius: "18px",
            padding: "16px",
            boxShadow: "0 2px 12px rgba(200,140,0,0.08)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
              <span style={{ fontSize: "20px" }}>{s.flag}</span>
              <div>
                <div style={{ color: s.color, fontSize: "9px", fontWeight: "800", letterSpacing: "1.5px" }}>{s.pays.toUpperCase()}</div>
                <div style={{ color: "#1a1200", fontSize: "13px", fontWeight: "800" }}>{s.titre}</div>
              </div>
            </div>
            <p style={{ color: "#6b5000", fontSize: "11px", margin: "0 0 8px", lineHeight: 1.5 }}>{s.adresse}</p>
            <a href={`tel:${s.tel}`} style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: s.color, fontSize: "12px", fontWeight: "700", textDecoration: "none", background: `${s.color}12`, border: `1px solid ${s.color}30`, borderRadius: "10px", padding: "7px 12px" }}>
              📞 {s.tel}
            </a>
          </div>
        ))}
        <div style={{ width: "8px", flexShrink: 0 }} />
      </div>

      {/* ── Form type selector ── */}
      <div style={{ padding: "0 20px 20px" }}>
        <div style={{ marginBottom: "14px" }}>
          <span style={{ color: "#8B6914", fontSize: "10px", fontWeight: "800", letterSpacing: "2px" }}>TYPE DE DEMANDE</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "28px" }}>
          {FORM_TYPES.map(ft => {
            const isActive = activeForm === ft.id;
            return (
              <button key={ft.id} onClick={() => setActiveForm(ft.id)} style={{ padding: "14px 12px", borderRadius: "16px", border: isActive ? "2px solid #F5A623" : "1.5px solid rgba(255,255,255,0.85)", background: isActive ? "rgba(245,166,35,0.12)" : "rgba(255,255,255,0.65)", backdropFilter: "blur(12px)", cursor: "pointer", textAlign: "left", boxShadow: isActive ? "0 4px 16px rgba(245,166,35,0.2)" : "0 2px 8px rgba(200,140,0,0.06)", transition: "all 0.15s ease" }}>
                <div style={{ fontSize: "20px", marginBottom: "6px" }}>{ft.icon}</div>
                <div style={{ color: isActive ? "#c47a00" : "#1a1200", fontSize: "12px", fontWeight: "800", marginBottom: "3px", lineHeight: 1.2 }}>{ft.label}</div>
                <div style={{ color: "#8B6914", fontSize: "10px", lineHeight: 1.4 }}>{ft.desc}</div>
              </button>
            );
          })}
        </div>

        {status === "success" ? (
          <div className="fade-up" style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(12px)", border: "1.5px solid rgba(255,255,255,0.9)", borderRadius: "24px", padding: "40px 24px", textAlign: "center" }}>
            <div style={{ fontSize: "48px", marginBottom: "14px" }}>✅</div>
            <h3 style={{ color: "#1a1200", fontSize: "18px", fontWeight: "900", margin: "0 0 8px" }}>Message envoyé !</h3>
            <p style={{ color: "#6b5000", fontSize: "13px", maxWidth: "260px", margin: "0 auto 20px", lineHeight: 1.6 }}>Notre équipe vous répond sous 24–48h ouvrées.</p>
            <button onClick={() => setStatus("idle")} style={{ background: "#F5A623", color: "#1a1200", fontWeight: "800", fontSize: "14px", padding: "13px 28px", borderRadius: "14px", border: "none", cursor: "pointer", boxShadow: "0 4px 16px rgba(245,166,35,0.35)", fontFamily: "var(--font-sora), sans-serif" }}>
              Nouveau message
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="fade-up" style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(12px)", border: "1.5px solid rgba(255,255,255,0.9)", borderRadius: "24px", padding: "24px", boxShadow: "0 4px 24px rgba(200,140,0,0.1)" }}>

            <div className="hp-field" aria-hidden="true">
              <input tabIndex={-1} name="_hp" value={honeypot} onChange={e => setHoneypot(e.target.value)} autoComplete="off" />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px", paddingBottom: "16px", borderBottom: "1px solid rgba(200,140,0,0.12)" }}>
              <div style={{ width: "3px", height: "20px", borderRadius: "2px", background: "#F5A623", flexShrink: 0 }} />
              <div>
                <div style={{ color: "#1a1200", fontSize: "15px", fontWeight: "900" }}>{currentType?.icon} {currentType?.label}</div>
                <div style={{ color: "#8B6914", fontSize: "11px" }}>{currentType?.desc}</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", color: "#8B6914", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>PRÉNOM *</label>
                  <input name="prenom" required value={formData.prenom} onChange={handleChange} placeholder="Alpha" style={inp} />
                </div>
                <div>
                  <label style={{ display: "block", color: "#8B6914", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>NOM *</label>
                  <input name="nom" required value={formData.nom} onChange={handleChange} placeholder="Diallo" style={inp} />
                </div>
              </div>

              <div>
                <label style={{ display: "block", color: "#8B6914", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>EMAIL *</label>
                <input name="email" type="email" required value={formData.email} onChange={handleChange} placeholder="alpha@exemple.com" style={inp} />
              </div>

              <div>
                <label style={{ display: "block", color: "#8B6914", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>TÉLÉPHONE</label>
                <input name="telephone" type="tel" value={formData.telephone} onChange={handleChange} placeholder="+224 6xx xx xx xx" style={inp} />
              </div>

              {activeForm === "institution" && (
                <>
                  <div>
                    <label style={{ display: "block", color: "#8B6914", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>NOM DE L&apos;INSTITUTION *</label>
                    <input name="nomInstitution" required value={formData.nomInstitution} onChange={handleChange} placeholder="Hôpital National Donka" style={inp} />
                  </div>
                  <div>
                    <label style={{ display: "block", color: "#8B6914", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>TYPE D&apos;INSTITUTION *</label>
                    <select name="typeInstitution" required value={formData.typeInstitution} onChange={handleChange} style={inp}>
                      <option value="">Sélectionner...</option>
                      <option>Hôpital / Clinique</option>
                      <option>École / Université</option>
                      <option>Mairie / Administration</option>
                      <option>Banque / Microfinance</option>
                      <option>Ambassade / Consulat</option>
                      <option>ONG / Association</option>
                      <option>Tribunal / Justice</option>
                      <option>Autre</option>
                    </select>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={{ display: "block", color: "#8B6914", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>VILLE *</label>
                      <input name="ville" required value={formData.ville} onChange={handleChange} placeholder="Conakry" style={inp} />
                    </div>
                    <div>
                      <label style={{ display: "block", color: "#8B6914", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>PAYS *</label>
                      <input name="pays" required value={formData.pays} onChange={handleChange} placeholder="Guinée" style={inp} />
                    </div>
                  </div>
                </>
              )}

              {activeForm === "presse" && (
                <>
                  <div>
                    <label style={{ display: "block", color: "#8B6914", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>MÉDIA / CHAÎNE *</label>
                    <input name="media" required value={formData.media} onChange={handleChange} placeholder="RFI, BBC Afrique..." style={inp} />
                  </div>
                  <div>
                    <label style={{ display: "block", color: "#8B6914", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>PUBLICATION / ÉMISSION</label>
                    <input name="publication" value={formData.publication} onChange={handleChange} placeholder="Journal du Jour" style={inp} />
                  </div>
                </>
              )}

              {activeForm === "support" && (
                <>
                  <div>
                    <label style={{ display: "block", color: "#8B6914", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>TYPE DE PROBLÈME *</label>
                    <select name="typeProbleme" required value={formData.typeProbleme} onChange={handleChange} style={inp}>
                      <option value="">Sélectionner...</option>
                      <option>Connexion / Authentification</option>
                      <option>Prise de rendez-vous</option>
                      <option>Affichage / Interface</option>
                      <option>Notification / Email</option>
                      <option>Données incorrectes</option>
                      <option>Autre bug</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", color: "#8B6914", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>URL DE LA PAGE</label>
                    <input name="urlPage" value={formData.urlPage} onChange={handleChange} placeholder="https://yelen224.com/..." style={inp} />
                  </div>
                </>
              )}

              <div>
                <label style={{ display: "block", color: "#8B6914", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>SUJET *</label>
                <input name="sujet" required value={formData.sujet} onChange={handleChange} placeholder="Objet de votre message" style={inp} />
              </div>

              {activeForm !== "institution" && (
                <div>
                  <label style={{ display: "block", color: "#8B6914", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>ORGANISATION (optionnel)</label>
                  <input name="organisation" value={formData.organisation} onChange={handleChange} placeholder="Ministère, ONG, Entreprise..." style={inp} />
                </div>
              )}

              <div>
                <label style={{ display: "block", color: "#8B6914", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>MESSAGE *</label>
                <textarea name="message" required value={formData.message} onChange={handleChange} rows={5} placeholder="Décrivez votre demande en détail..." style={{ ...inp, resize: "vertical", minHeight: "120px" }} />
              </div>

              <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", background: "rgba(200,140,0,0.06)", border: "1px solid rgba(200,140,0,0.15)", borderRadius: "12px", padding: "12px" }}>
                <span style={{ fontSize: "14px", flexShrink: 0 }}>🔒</span>
                <p style={{ color: "#6b5000", fontSize: "11px", margin: 0, lineHeight: 1.6 }}>
                  Données protégées · jamais partagées avec des tiers. Réponse sous 24–48h ouvrées.
                </p>
              </div>

              {status === "error" && (
                <div style={{ padding: "12px 16px", borderRadius: "12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#dc2626", fontSize: "13px", fontWeight: "600" }}>
                  ❌ Erreur. Réessayez ou écrivez à yelen224gn@gmail.com
                </div>
              )}

              <button type="submit" disabled={status === "sending"} style={{ width: "100%", padding: "16px", borderRadius: "16px", border: "none", background: status === "sending" ? "rgba(200,140,0,0.3)" : "linear-gradient(135deg, #F5A623, #e8950f)", color: status === "sending" ? "#8B6914" : "#1a1200", fontWeight: "900", fontSize: "15px", cursor: status === "sending" ? "not-allowed" : "pointer", fontFamily: "var(--font-sora), sans-serif", boxShadow: status === "sending" ? "none" : "0 6px 20px rgba(245,166,35,0.4)", letterSpacing: "0.3px", transition: "all 0.15s ease" }}>
                {status === "sending" ? "Envoi en cours..." : "Envoyer le message →"}
              </button>
            </div>
          </form>
        )}

        <div style={{ marginTop: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          {[
            { icon: "⚡", titre: "Réponse rapide", desc: "24–48h ouvrées" },
            { icon: "🌍", titre: "Support international", desc: "Guinée & New York" },
          ].map(info => (
            <div key={info.titre} style={{ background: "rgba(255,255,255,0.6)", backdropFilter: "blur(8px)", border: "1.5px solid rgba(255,255,255,0.85)", borderRadius: "16px", padding: "16px", textAlign: "center", boxShadow: "0 2px 8px rgba(200,140,0,0.06)" }}>
              <div style={{ fontSize: "22px", marginBottom: "6px" }}>{info.icon}</div>
              <div style={{ color: "#1a1200", fontSize: "12px", fontWeight: "800", marginBottom: "2px" }}>{info.titre}</div>
              <div style={{ color: "#8B6914", fontSize: "11px" }}>{info.desc}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "12px", background: "rgba(255,255,255,0.6)", border: "1.5px solid rgba(255,255,255,0.85)", borderRadius: "16px", padding: "16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: "#8B6914", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "2px" }}>EMAIL DIRECT</div>
            <div style={{ color: "#1a1200", fontSize: "13px", fontWeight: "700" }}>yelen224gn@gmail.com</div>
          </div>
          <a href="mailto:yelen224gn@gmail.com" style={{ background: "#F5A623", color: "#1a1200", fontSize: "12px", fontWeight: "800", padding: "9px 16px", borderRadius: "12px", textDecoration: "none", boxShadow: "0 3px 10px rgba(245,166,35,0.3)", fontFamily: "var(--font-sora), sans-serif", flexShrink: 0 }}>
            Écrire →
          </a>
        </div>
      </div>

      <div style={{ height: "env(safe-area-inset-bottom, 40px)" }} />
    </div>
  );
}