"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const DOCUMENTS_PAR_CATEGORIE: Record<string, { label: string; description: string; formats: string; obligatoire: boolean }[]> = {
  "Hopital / Clinique": [
    { label: "Autorisation d'exercice du Ministere de la Sante", description: "Document officiel delivre par le Ministere de la Sante Publique de Guinee autorisant l'etablissement a exercer.", formats: "PDF, JPG, PNG", obligatoire: true },
    { label: "Registre de Commerce (RCCM)", description: "Extrait du registre de commerce et du credit mobilier.", formats: "PDF", obligatoire: true },
    { label: "Carte d'identification fiscale (NIF)", description: "Numero d'Identification Fiscale delivre par la Direction Nationale des Impots.", formats: "PDF, JPG", obligatoire: true },
  ],
  "Ecole / Universite": [
    { label: "Arrete ministeriel d'ouverture", description: "Arrete du Ministere de l'Education Nationale ou de l'Enseignement Superieur autorisant l'ouverture.", formats: "PDF", obligatoire: true },
    { label: "Registre de Commerce (RCCM)", description: "Extrait du registre de commerce.", formats: "PDF", obligatoire: true },
    { label: "Carte d'identification fiscale (NIF)", description: "Numero d'Identification Fiscale.", formats: "PDF, JPG", obligatoire: true },
  ],
  "Mairie / Administration": [
    { label: "Arrete de creation ou decret officiel", description: "Document officiel attestant la creation et l'existence legale de l'entite administrative.", formats: "PDF", obligatoire: true },
    { label: "Lettre d'autorisation du responsable hierarchique", description: "Lettre signee par l'autorite de tutelle authorisant l'enregistrement sur la plateforme.", formats: "PDF", obligatoire: true },
  ],
  "Banque / Microfinance": [
    { label: "Agrement de la Banque Centrale de la Republique de Guinee (BCRG)", description: "Autorisation officielle de la BCRG pour exercer une activite bancaire ou de microfinance.", formats: "PDF", obligatoire: true },
    { label: "Registre de Commerce (RCCM)", description: "Extrait du registre de commerce.", formats: "PDF", obligatoire: true },
    { label: "Carte d'identification fiscale (NIF)", description: "Numero d'Identification Fiscale.", formats: "PDF, JPG", obligatoire: true },
  ],
  "Pharmacie": [
    { label: "Autorisation d'exercice - Ordre National des Pharmaciens", description: "Document delivre par l'Ordre National des Pharmaciens de Guinee.", formats: "PDF, JPG", obligatoire: true },
    { label: "Registre de Commerce (RCCM)", description: "Extrait du registre de commerce.", formats: "PDF", obligatoire: true },
    { label: "Carte d'identification fiscale (NIF)", description: "Numero d'Identification Fiscale.", formats: "PDF, JPG", obligatoire: true },
  ],
  "Cabinet medical": [
    { label: "Autorisation d'exercice prive - Ministere de la Sante", description: "Autorisation officielle pour exercer la medecine en cabinet prive en Guinee.", formats: "PDF, JPG", obligatoire: true },
    { label: "Diplome et inscription a l'Ordre des Medecins", description: "Copie du diplome et attestation d'inscription a l'Ordre National des Medecins de Guinee.", formats: "PDF, JPG", obligatoire: true },
  ],
  "Tribunal / Justice": [
    { label: "Arrete de creation du Ministere de la Justice", description: "Document officiel attestant la creation et la juridiction de l'entite judiciaire.", formats: "PDF", obligatoire: true },
    { label: "Lettre d'autorisation du Ministre de la Justice", description: "Autorisation formelle pour l'enregistrement sur la plateforme Yelen224.", formats: "PDF", obligatoire: true },
  ],
  "Transport / Logistique": [
    { label: "Licence de transport - Ministere des Transports", description: "Licence officielle delivree par le Ministere des Transports et des Infrastructures.", formats: "PDF", obligatoire: true },
    { label: "Registre de Commerce (RCCM)", description: "Extrait du registre de commerce.", formats: "PDF", obligatoire: true },
    { label: "Carte d'identification fiscale (NIF)", description: "Numero d'Identification Fiscale.", formats: "PDF, JPG", obligatoire: true },
  ],
  "ONG / Association": [
    { label: "Recepisse de declaration au Ministere de l'Administration du Territoire", description: "Document officiel attestant la reconnaissance legale de l'ONG ou association en Guinee.", formats: "PDF", obligatoire: true },
    { label: "Statuts de l'organisation", description: "Copie des statuts signes et enregistres.", formats: "PDF", obligatoire: true },
    { label: "Proces verbal de l'assemblee constitutive", description: "PV signe de la reunion fondatrice de l'organisation.", formats: "PDF", obligatoire: false },
  ],
  "Autre": [
    { label: "Document officiel d'identification de la structure", description: "Tout document officiel prouvant l'existence legale et l'identite de votre etablissement (RCCM, arrete, decret, etc.).", formats: "PDF, JPG, PNG", obligatoire: true },
    { label: "Carte d'identification fiscale (NIF)", description: "Numero d'Identification Fiscale delivre par les autorites guineennes.", formats: "PDF, JPG", obligatoire: false },
  ],
};

export default function DocumentOfficiel() {
  const router = useRouter();
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [loadingCategory, setLoadingCategory] = useState(true);

  useEffect(() => {
    const fetchCategory = async () => {
      if (typeof window === "undefined") return;
      const id = localStorage.getItem("yelen224_institution_id");
      if (!id) { router.push("/institution/inscription"); return; }
      const { data } = await supabase
        .from("institutions")
        .select("category")
        .eq("id", id)
        .single();
      setCategory(data?.category || "Autre");
      setLoadingCategory(false);
    };
    fetchCategory();
  }, [router]);

  const handleFile = (label: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFiles((prev) => ({ ...prev, [label]: file }));
    if (file.type.startsWith("image/")) {
      setPreviews((prev) => ({ ...prev, [label]: URL.createObjectURL(file) }));
    } else {
      setPreviews((prev) => ({ ...prev, [label]: "pdf" }));
    }
  };

  const handleSubmit = async () => {
    setError("");
    const docs = DOCUMENTS_PAR_CATEGORIE[category || "Autre"] || [];
    const obligatoires = docs.filter((d) => d.obligatoire);
    const manquants = obligatoires.filter((d) => !files[d.label]);

    if (manquants.length > 0) {
      setError(`Document(s) obligatoire(s) manquant(s) : ${manquants.map((d) => d.label).join(", ")}`);
      return;
    }

    setLoading(true);
    try {
      const institutionId = localStorage.getItem("yelen224_institution_id");
      if (!institutionId) throw new Error("Session expiree");

      const uploadedUrls: string[] = [];

      for (const [label, file] of Object.entries(files)) {
        if (!file) continue;
        const ext = file.name.split(".").pop();
        const safeName = label.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
        const path = `documents/${institutionId}/${safeName}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(path, file, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("documents").getPublicUrl(path);
        uploadedUrls.push(urlData.publicUrl);
      }

      const { error: updateError } = await supabase
        .from("institutions")
        .update({ document_officiel: uploadedUrls[0] })
        .eq("id", institutionId);

      if (updateError) throw updateError;
      setSubmitted(true);
    } catch {
      setError("Erreur lors de l'envoi. Verifiez votre connexion et reessayez.");
    } finally {
      setLoading(false);
    }
  };

  if (loadingCategory) return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0D0D1A", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "#F5A623", fontSize: "14px", letterSpacing: "1px" }}>CHARGEMENT...</p>
    </div>
  );

  const docs = DOCUMENTS_PAR_CATEGORIE[category || "Autre"] || [];

  if (submitted) return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0D0D1A", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: "480px", width: "100%", textAlign: "center" }}>
        <div style={{ width: "80px", height: "80px", borderRadius: "50%", backgroundColor: "rgba(34,197,94,0.15)", border: "2px solid rgba(34,197,94,0.4)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: "36px" }}>&#10003;</div>
        <h1 style={{ color: "#fff", fontSize: "24px", fontWeight: "800", margin: "0 0 12px" }}>Document soumis avec succes</h1>
        <p style={{ color: "#666", fontSize: "14px", lineHeight: "1.7", margin: "0 0 32px" }}>
          Votre dossier est en cours d&apos;examen par l&apos;equipe de verification de Yelen224. Ce processus prend generalement entre 24 et 72 heures ouvrables. Vous serez notifie par SMS une fois la decision rendue.
        </p>
        <div style={{ backgroundColor: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)", borderRadius: "12px", padding: "16px 20px", marginBottom: "28px", textAlign: "left" }}>
          <p style={{ color: "#F5A623", fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 8px" }}>Prochaines etapes</p>
          {["Examen du dossier par l'equipe Yelen224", "Verification des documents soumis", "Notification par SMS de la decision", "Activation de votre espace institution"].map((step, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 0", borderBottom: i < 3 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
              <div style={{ width: "20px", height: "20px", borderRadius: "50%", backgroundColor: "rgba(245,166,35,0.15)", border: "1px solid rgba(245,166,35,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ color: "#F5A623", fontSize: "10px", fontWeight: "700" }}>{i + 1}</span>
              </div>
              <span style={{ color: "#aaa", fontSize: "13px" }}>{step}</span>
            </div>
          ))}
        </div>
        <button onClick={() => router.push("/institution/dashboard")} style={{ width: "100%", backgroundColor: "#F5A623", color: "#0D0D1A", border: "none", borderRadius: "12px", padding: "15px", fontSize: "15px", fontWeight: "700", cursor: "pointer" }}>
          Retour au tableau de bord
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0D0D1A", fontFamily: "'Segoe UI', sans-serif", color: "#fff" }}>
      <style>{`
        .upload-zone:hover { border-color: rgba(245,166,35,0.5) !important; background-color: rgba(245,166,35,0.05) !important; }
        .upload-zone { transition: all 0.2s; }
      `}</style>

      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(13,13,26,0.95)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(245,166,35,0.15)", padding: "0 24px" }}>
        <div style={{ maxWidth: "720px", margin: "0 auto", height: "60px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <a href="/institution/dashboard" style={{ color: "#666", fontSize: "20px", textDecoration: "none", lineHeight: 1 }}>&#8592;</a>
            <span style={{ color: "#F5A623", fontSize: "17px", fontWeight: "800", letterSpacing: "2px" }}>YELEN224</span>
          </div>
          <span style={{ backgroundColor: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.25)", color: "#F5A623", fontSize: "11px", fontWeight: "700", padding: "4px 12px", borderRadius: "20px", letterSpacing: "0.5px" }}>VERIFICATION</span>
        </div>
      </header>

      <main style={{ maxWidth: "720px", margin: "0 auto", padding: "36px 24px 60px" }}>
        <div style={{ marginBottom: "32px" }}>
          <p style={{ color: "#F5A623", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", margin: "0 0 8px" }}>Dossier de verification</p>
          <h1 style={{ color: "#fff", fontSize: "26px", fontWeight: "800", margin: "0 0 10px" }}>Verification de votre etablissement</h1>
          <p style={{ color: "#666", fontSize: "14px", lineHeight: "1.7", margin: 0 }}>
            Pour garantir la confiance des citoyens guineens, Yelen224 verifie l&apos;authenticite de chaque etablissement. Les documents ci-dessous sont requis pour votre categorie : <strong style={{ color: "#F5A623" }}>{category}</strong>.
          </p>
        </div>

        <div style={{ backgroundColor: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", borderLeft: "4px solid #3b82f6", borderRadius: "12px", padding: "16px 20px", marginBottom: "28px", display: "flex", gap: "14px", alignItems: "flex-start" }}>
          <span style={{ fontSize: "20px", marginTop: "2px" }}>&#128274;</span>
          <div>
            <p style={{ color: "#93c5fd", fontSize: "13px", fontWeight: "600", margin: "0 0 4px" }}>Confidentialite et securite des donnees</p>
            <p style={{ color: "rgba(147,197,253,0.7)", fontSize: "12px", margin: 0, lineHeight: "1.6" }}>
              Vos documents sont chiffres et stockes de maniere securisee. Ils ne sont accessibles qu&apos;aux agents de verification autorises de Yelen224 et sont traites conformement a la reglementation guineenne sur la protection des donnees.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px", marginBottom: "28px" }}>
          {docs.map((doc, i) => (
            <div key={i} style={{ backgroundColor: "#13132A", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "16px", padding: "24px", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "16px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    <h3 style={{ color: "#fff", fontSize: "14px", fontWeight: "700", margin: 0 }}>{doc.label}</h3>
                    {doc.obligatoire
                      ? <span style={{ backgroundColor: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "20px" }}>OBLIGATOIRE</span>
                      : <span style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#888", fontSize: "10px", fontWeight: "600", padding: "2px 8px", borderRadius: "20px" }}>OPTIONNEL</span>
                    }
                  </div>
                  <p style={{ color: "#666", fontSize: "12px", lineHeight: "1.6", margin: "0 0 6px" }}>{doc.description}</p>
                  <p style={{ color: "#444", fontSize: "11px", margin: 0 }}>Formats acceptes : <span style={{ color: "#F5A623" }}>{doc.formats}</span></p>
                </div>
              </div>

              <label className="upload-zone" style={{ display: "flex", alignItems: "center", gap: "16px", backgroundColor: files[doc.label] ? "rgba(34,197,94,0.05)" : "rgba(255,255,255,0.02)", border: `1px dashed ${files[doc.label] ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.1)"}`, borderRadius: "12px", padding: "16px 20px", cursor: "pointer" }}>
                <div style={{ width: "44px", height: "44px", borderRadius: "10px", flexShrink: 0, backgroundColor: files[doc.label] ? "rgba(34,197,94,0.15)" : "rgba(245,166,35,0.08)", border: `1px solid ${files[doc.label] ? "rgba(34,197,94,0.3)" : "rgba(245,166,35,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {previews[doc.label] === "pdf"
                    ? <span style={{ color: "#ef4444", fontSize: "11px", fontWeight: "800" }}>PDF</span>
                    : previews[doc.label]
                      ? <img src={previews[doc.label]} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="preview" />
                      : <span style={{ color: "#F5A623", fontSize: "20px" }}>&#8593;</span>
                  }
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ color: files[doc.label] ? "#22c55e" : "#fff", fontSize: "13px", fontWeight: "600", margin: "0 0 3px" }}>
                    {files[doc.label] ? files[doc.label]!.name : "Cliquer pour selectionner un fichier"}
                  </p>
                  <p style={{ color: "#444", fontSize: "11px", margin: 0 }}>
                    {files[doc.label] ? `${(files[doc.label]!.size / 1024 / 1024).toFixed(2)} MB` : "PDF, JPG ou PNG - max 10MB"}
                  </p>
                </div>
                {files[doc.label] && <span style={{ color: "#22c55e", fontSize: "18px" }}>&#10003;</span>}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => handleFile(doc.label, e)} style={{ display: "none" }} />
              </label>
            </div>
          ))}
        </div>

        {error && (
          <div style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderLeft: "4px solid #ef4444", borderRadius: "12px", padding: "14px 18px", marginBottom: "20px" }}>
            <p style={{ color: "#ef4444", fontSize: "13px", margin: 0, lineHeight: "1.6" }}>{error}</p>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{ width: "100%", backgroundColor: loading ? "#333" : "#F5A623", color: loading ? "#666" : "#0D0D1A", border: "none", borderRadius: "12px", padding: "16px", fontSize: "15px", fontWeight: "700", cursor: loading ? "not-allowed" : "pointer", letterSpacing: "0.5px" }}
        >
          {loading ? "Envoi en cours..." : "Soumettre le dossier pour verification"}
        </button>

        <p style={{ color: "#444", fontSize: "12px", textAlign: "center", marginTop: "16px", lineHeight: "1.6" }}>
          En soumettant ce dossier, vous certifiez que les documents fournis sont authentiques et vous engagez a respecter les conditions d&apos;utilisation de la plateforme Yelen224.
        </p>
      </main>
    </div>
  );
}