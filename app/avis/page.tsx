"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type RDV = {
  id: string;
  objet: string;
  date_rdv: string;
  heure_rdv: string;
  institution_id: string;
  institution: {
    name: string;
    category: string;
    ville: string;
    logo: string | null;
  } | null;
};

export default function LaissezAvis() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rdvId = searchParams.get("rdv_id");

  const [rdv, setRdv] = useState<RDV | null>(null);
  const [note, setNote] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [commentaire, setCommentaire] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [citoyenId, setCitoyenId] = useState<string | null>(null);

  const LABELS = ["", "Tres mauvais", "Mauvais", "Correct", "Bien", "Excellent"];
  const COLORS = ["", "#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e"];

  useEffect(() => {
    const id = localStorage.getItem("citoyenId");
    setCitoyenId(id);
    if (!rdvId) {
      setError("Aucun rendez-vous specifie.");
      setLoading(false);
      return;
    }
    fetchRDV(rdvId, id);
  }, [rdvId]);

  const fetchRDV = async (id: string, cId: string | null) => {
    try {
      const { data, error: rdvError } = await supabase
        .from("rdv")
        .select("id, objet, date_rdv, heure_rdv, institution_id, citoyen_id, statut")
        .eq("id", id)
        .single();

      if (rdvError || !data) {
        setError("Rendez-vous introuvable.");
        setLoading(false);
        return;
      }

      if (data.statut !== "termine") {
        setError("Vous ne pouvez laisser un avis qu'apres un rendez-vous termine.");
        setLoading(false);
        return;
      }

      const { data: existingAvis } = await supabase
        .from("avis")
        .select("id")
        .eq("rdv_id", id)
        .maybeSingle();

      if (existingAvis) {
        setError("Vous avez deja laisse un avis pour ce rendez-vous.");
        setLoading(false);
        return;
      }

      const { data: instData } = await supabase
        .from("institutions")
        .select("name, category, ville, logo")
        .eq("id", data.institution_id)
        .single();

      setRdv({
        id: data.id,
        objet: data.objet,
        date_rdv: data.date_rdv,
        heure_rdv: data.heure_rdv,
        institution_id: data.institution_id,
        institution: instData || null,
      });
    } catch (err) {
      setError("Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setError("");
    if (note === 0) {
      setError("Veuillez attribuer une note entre 1 et 5 etoiles.");
      return;
    }
    if (commentaire.trim().length < 10) {
      setError("Votre commentaire doit contenir au moins 10 caracteres.");
      return;
    }
    setSubmitting(true);
    try {
      const { error: insertError } = await supabase
        .from("avis")
        .insert({
          citoyen_id: citoyenId,
          institution_id: rdv?.institution_id,
          rdv_id: rdv?.id,
          note: note,
          commentaire: commentaire.trim(),
        });

      if (insertError) throw insertError;

      const { data: allAvis } = await supabase
        .from("avis")
        .select("note")
        .eq("institution_id", rdv?.institution_id);

      if (allAvis && allAvis.length > 0) {
        const moyenne = allAvis.reduce((acc, a) => acc + a.note, 0) / allAvis.length;
        await supabase
          .from("institutions")
          .update({
            moyenne_avis: Math.round(moyenne * 10) / 10,
            nb_avis: allAvis.length,
          })
          .eq("id", rdv?.institution_id);
      }

      setSubmitted(true);
    } catch (err) {
      setError("Erreur lors de l'envoi. Reessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0D0D1A", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "40px", height: "40px", border: "3px solid #F5A623", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error && !rdv) return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0D0D1A", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: "440px", width: "100%", textAlign: "center" }}>
        <div style={{ width: "64px", height: "64px", borderRadius: "50%", backgroundColor: "rgba(239,68,68,0.1)", border: "2px solid rgba(239,68,68,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: "28px" }}>
          &#9888;
        </div>
        <h2 style={{ color: "#fff", fontSize: "20px", fontWeight: "700", margin: "0 0 10px" }}>Acces refuse</h2>
        <p style={{ color: "#666", fontSize: "14px", margin: "0 0 28px", lineHeight: "1.6" }}>{error}</p>
        <button onClick={() => router.back()} style={{ backgroundColor: "#F5A623", color: "#0D0D1A", border: "none", borderRadius: "10px", padding: "12px 28px", fontSize: "14px", fontWeight: "700", cursor: "pointer" }}>
          Retour
        </button>
      </div>
    </div>
  );

  if (submitted) return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0D0D1A", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: "440px", width: "100%", textAlign: "center" }}>
        <div style={{ width: "80px", height: "80px", borderRadius: "50%", backgroundColor: "rgba(34,197,94,0.12)", border: "2px solid rgba(34,197,94,0.4)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: "36px" }}>
          &#10003;
        </div>
        <h1 style={{ color: "#fff", fontSize: "24px", fontWeight: "800", margin: "0 0 10px" }}>Merci pour votre avis !</h1>
        <p style={{ color: "#666", fontSize: "14px", margin: "0 0 8px", lineHeight: "1.7" }}>
          Votre evaluation aide les autres citoyens guinéens a choisir les meilleurs services.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: "4px", margin: "16px 0 28px" }}>
          {[1, 2, 3, 4, 5].map((s) => (
            <span key={s} style={{ fontSize: "28px", color: s <= note ? COLORS[note] : "#333" }}>&#9733;</span>
          ))}
        </div>
        <p style={{ color: COLORS[note], fontSize: "16px", fontWeight: "700", margin: "0 0 28px" }}>{LABELS[note]}</p>
        <button onClick={() => router.push("/")} style={{ width: "100%", backgroundColor: "#F5A623", color: "#0D0D1A", border: "none", borderRadius: "12px", padding: "14px", fontSize: "15px", fontWeight: "700", cursor: "pointer" }}>
          Retour a l'accueil
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0D0D1A", fontFamily: "'Segoe UI', sans-serif", color: "#fff" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .star { transition: transform 0.1s; cursor: pointer; }
        .star:hover { transform: scale(1.2); }
        textarea::placeholder { color: #333; }
        textarea:focus { border-color: rgba(245,166,35,0.4) !important; outline: none; }
      `}</style>

      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(8,8,18,0.95)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(245,166,35,0.12)", padding: "0 24px" }}>
        <div style={{ maxWidth: "600px", margin: "0 auto", height: "58px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button onClick={() => router.back()} style={{ backgroundColor: "transparent", border: "none", color: "#555", fontSize: "20px", cursor: "pointer", padding: "4px" }}>&#8592;</button>
            <span style={{ color: "#F5A623", fontSize: "17px", fontWeight: "800", letterSpacing: "2px" }}>YELEN224</span>
          </div>
          <span style={{ color: "#555", fontSize: "12px" }}>Evaluation de service</span>
        </div>
      </header>

      <main style={{ maxWidth: "600px", margin: "0 auto", padding: "32px 24px 60px" }}>

        <div style={{ backgroundColor: "#13132A", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "16px", padding: "20px", marginBottom: "28px", display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "12px", flexShrink: 0, backgroundColor: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.2)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {rdv?.institution?.logo
              ? <img src={rdv.institution.logo} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <span style={{ color: "#F5A623", fontSize: "20px", fontWeight: "800" }}>{rdv?.institution?.name?.[0]?.toUpperCase() || "?"}</span>
            }
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ color: "#fff", fontSize: "15px", fontWeight: "700", margin: "0 0 4px" }}>{rdv?.institution?.name || "Institution"}</h3>
            <p style={{ color: "#555", fontSize: "12px", margin: "0 0 6px" }}>{rdv?.institution?.category} — {rdv?.institution?.ville}</p>
            <div style={{ display: "flex", gap: "12px" }}>
              <span style={{ backgroundColor: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "#22c55e", fontSize: "10px", fontWeight: "700", padding: "3px 8px", borderRadius: "20px" }}>RDV TERMINE</span>
              <span style={{ color: "#444", fontSize: "12px" }}>
                {rdv?.date_rdv ? new Date(rdv.date_rdv).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : ""} a {rdv?.heure_rdv}
              </span>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ color: "#fff", fontSize: "22px", fontWeight: "800", margin: "0 0 8px" }}>Comment s'est passe votre rendez-vous ?</h1>
          <p style={{ color: "#555", fontSize: "13px", margin: 0, lineHeight: "1.6" }}>
            Objet : <span style={{ color: "#aaa" }}>{rdv?.objet}</span><br />
            Votre avis aide les autres citoyens a choisir les meilleurs services en Guinee.
          </p>
        </div>

        <div style={{ backgroundColor: "#13132A", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "16px", padding: "28px", marginBottom: "20px", textAlign: "center" }}>
          <p style={{ color: "#888", fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 20px" }}>Votre note globale</p>
          <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginBottom: "14px" }}>
            {[1, 2, 3, 4, 5].map((s) => (
              <span
                key={s}
                className="star"
                onMouseEnter={() => setHovered(s)}
                onMouseLeave={() => setHovered(0)}
                onClick={() => setNote(s)}
                style={{ fontSize: "44px", color: s <= (hovered || note) ? COLORS[hovered || note] : "#222", filter: s <= (hovered || note) ? "drop-shadow(0 0 8px " + COLORS[hovered || note] + "66)" : "none", transition: "all 0.15s" }}
              >
                &#9733;
              </span>
            ))}
          </div>
          {(hovered || note) > 0 && (
            <p style={{ color: COLORS[hovered || note], fontSize: "15px", fontWeight: "700", margin: 0 }}>{LABELS[hovered || note]}</p>
          )}
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label style={{ color: "#888", fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px", display: "block", marginBottom: "10px" }}>Votre commentaire *</label>
          <textarea
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Decrivez votre experience : accueil, temps d'attente, qualite du service, respect des horaires..."
            rows={5}
            style={{ width: "100%", backgroundColor: "#13132A", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "14px 16px", color: "#fff", fontSize: "14px", lineHeight: "1.7", resize: "none", boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
            <span style={{ color: commentaire.length < 10 ? "#ef4444" : "#444", fontSize: "11px" }}>
              {commentaire.length < 10 ? `${10 - commentaire.length} caracteres minimum requis` : ""}
            </span>
            <span style={{ color: "#444", fontSize: "11px" }}>{commentaire.length} / 500</span>
          </div>
        </div>

        <div style={{ backgroundColor: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: "10px", padding: "12px 16px", marginBottom: "24px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <span style={{ color: "#3b82f6", fontSize: "14px", marginTop: "1px" }}>&#8505;</span>
          <p style={{ color: "rgba(147,197,253,0.7)", fontSize: "12px", margin: 0, lineHeight: "1.6" }}>
            Votre avis sera publie publiquement sur le profil de l'etablissement. Tout avis diffamatoire, faux ou abusif sera supprime et pourra entrainer la suspension de votre compte.
          </p>
        </div>

        {error && (
          <div style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderLeft: "4px solid #ef4444", borderRadius: "10px", padding: "12px 16px", marginBottom: "20px" }}>
            <p style={{ color: "#ef4444", fontSize: "13px", margin: 0 }}>{error}</p>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting || note === 0}
          style={{ width: "100%", backgroundColor: note === 0 ? "#111" : submitting ? "#333" : "#F5A623", color: note === 0 ? "#333" : "#0D0D1A", border: note === 0 ? "1px solid rgba(255,255,255,0.06)" : "none", borderRadius: "12px", padding: "16px", fontSize: "15px", fontWeight: "700", cursor: note === 0 || submitting ? "not-allowed" : "pointer", transition: "all 0.2s" }}
        >
          {submitting ? "Envoi en cours..." : note === 0 ? "Selectionnez une note pour continuer" : "Publier mon avis"}
        </button>

        <p style={{ color: "#333", fontSize: "11px", textAlign: "center", marginTop: "14px", lineHeight: "1.6" }}>
          En publiant cet avis, vous certifiez avoir reellement effectue ce rendez-vous et que votre evaluation est sincere et honnete.
        </p>
      </main>
    </div>
  );
}