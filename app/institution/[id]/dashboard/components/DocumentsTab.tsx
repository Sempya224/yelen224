"use client";

// Onglet Documents institutionnels — remplace l'ancien /institution/document.
// Principes non négociables (niveau gouvernemental/Stripe Connect/Doctolib) :
// l'institution ne voit JAMAIS le fichier qu'elle a envoyé, seulement un
// statut. Aucune URL, même signée, n'est jamais exposée ici. Les documents
// requis sont dérivés automatiquement de statut_juridique (déjà collecté à
// l'onboarding) — jamais de re-choix de profil. Renvoi possible uniquement
// si le document est en 'complement_demande' ou 'rejete'.
import { useEffect, useRef, useState } from "react";
import { T } from "../theme";

type DocStatut = "recu" | "valide" | "complement_demande" | "rejete" | null;

type DocumentItem = {
  type: string;
  label: string;
  description: string;
  formats: string;
  obligatoire: boolean;
  statut: DocStatut;
  motif_rejet: string | null;
  soumis_le: string | null;
};

type DocumentsResponse = {
  institution_statut: string;
  statut_juridique: string | null;
  documents: DocumentItem[];
};

const RECU_VERS_EN_EXAMEN_MS = 24 * 60 * 60 * 1000;

export function DocumentsTab({ instId, onToast }: { instId: string; onToast: (msg: string, color?: string) => void }) {
  const [data, setData] = useState<DocumentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = async () => {
    const res = await fetch("/api/institution/documents");
    const j = res.ok ? await res.json().catch(() => null) : null;
    setData(j);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [instId]);

  const handleFile = async (type: string, file: File) => {
    setUploadingType(type);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("type", type);
    const res = await fetch("/api/institution/documents", { method: "POST", body: fd });
    const j = await res.json().catch(() => null);
    setUploadingType(null);
    if (!res.ok) { onToast(j?.error || "Échec de l'envoi du document.", T.red); return; }
    onToast("Document envoyé — en attente d'examen.", T.green);
    load();
  };

  if (loading) {
    return (
      <div style={{ padding: "48px 16px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "28px", height: "28px", border: `2px solid ${T.gold}20`, borderTopColor: T.gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
      </div>
    );
  }

  if (!data || !data.statut_juridique) {
    return (
      <div style={{ padding: "48px 16px", textAlign: "center" }}>
        <p style={{ color: T.t2, fontSize: "13px" }}>Profil incomplet — le statut juridique de l'établissement n'a pas encore été renseigné.</p>
      </div>
    );
  }

  // ── Compte validé : écran figé, jamais les fichiers, juste les types validés ──
  if (data.institution_statut === "validee") {
    return (
      <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
        <div style={{ maxWidth: "720px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", padding: "32px 16px" }}>
            <div style={{ width: "56px", height: "56px", borderRadius: "50%", backgroundColor: T.greenL, border: `1.5px solid ${T.green}40`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg width="26" height="26" viewBox="0 0 26 26" fill="none"><path d="M6 13.5L11 18.5L20 8" stroke={T.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <h1 style={{ color: T.t1, fontSize: "20px", fontWeight: "900", marginBottom: "8px" }}>Vos documents ont été validés</h1>
            <p style={{ color: T.t2, fontSize: "13px", lineHeight: 1.6, maxWidth: "420px", margin: "0 auto" }}>
              Votre établissement est vérifié auprès de Yelen224. Voici les documents retenus pour cette validation.
            </p>
          </div>
          <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", overflow: "hidden" }}>
            {data.documents.map((d) => (
              <div key={d.type} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ width: "26px", height: "26px", borderRadius: "50%", backgroundColor: T.greenL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke={T.green} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <span style={{ color: T.t1, fontSize: "13px", fontWeight: "600" }}>{d.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Écran actif : soumission / examen / renvoi ──
  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        <h1 style={{ color: T.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "6px" }}>Documents institutionnels</h1>
        <p style={{ color: T.t2, fontSize: "13px", marginBottom: "18px", lineHeight: 1.5 }}>
          Ces documents permettent à Yelen224 de vérifier l'existence légale de votre établissement. Ils ne sont consultables que par l'équipe de vérification — jamais visibles publiquement.
        </p>

        {data.documents.map((d) => (
          <DocumentCard
            key={d.type}
            doc={d}
            uploading={uploadingType === d.type}
            onPick={() => fileInputs.current[d.type]?.click()}
            inputRef={(el) => { fileInputs.current[d.type] = el; }}
            onFile={(f) => handleFile(d.type, f)}
          />
        ))}
      </div>
    </div>
  );
}

function DocumentCard({ doc, uploading, onPick, inputRef, onFile }: {
  doc: DocumentItem; uploading: boolean; onPick: () => void;
  inputRef: (el: HTMLInputElement | null) => void; onFile: (f: File) => void;
}) {
  const locked = doc.statut === "recu" || doc.statut === "valide";
  const badge = statutBadge(doc.statut, doc.soumis_le);

  return (
    <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "16px", marginBottom: "12px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px", marginBottom: "8px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: T.t1, fontSize: "14px", fontWeight: "700", marginBottom: "3px" }}>{doc.label}</div>
          <p style={{ color: T.t3, fontSize: "11.5px", lineHeight: 1.5, margin: 0 }}>{doc.description}</p>
        </div>
        {badge}
      </div>

      {doc.motif_rejet && (doc.statut === "rejete" || doc.statut === "complement_demande") && (
        <div style={{ backgroundColor: T.orangeL, border: `1px solid ${T.orange}30`, borderRadius: "10px", padding: "10px 12px", marginBottom: "10px" }}>
          <p style={{ color: T.orange, fontSize: "11.5px", lineHeight: 1.5, margin: 0, fontWeight: "600" }}>{doc.motif_rejet}</p>
        </div>
      )}

      {locked ? (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px", borderRadius: "12px", backgroundColor: T.bg3, border: `1px solid ${T.border}` }}>
          <span style={{ color: T.t3, fontSize: "12px" }}>
            {doc.statut === "valide" ? "Document validé — plus aucune action requise." : "Document reçu, en attente d'examen. Aucun renvoi possible pour l'instant."}
          </span>
        </div>
      ) : (
        <div onClick={onPick} className="tap" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", borderRadius: "12px", border: `1.5px dashed ${T.border2}`, cursor: uploading ? "default" : "pointer", position: "relative" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: T.bg3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {uploading ? (
              <div style={{ width: "16px", height: "16px", border: `2px solid ${T.gold}30`, borderTopColor: T.gold, borderRadius: "50%", animation: "spin 0.7s linear infinite" }}/>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 12V4M8 4L5 7M8 4L11 7" stroke={T.t3} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: T.t2, fontSize: "12.5px", fontWeight: "600" }}>{uploading ? "Envoi en cours…" : (doc.statut ? "Renvoyer le document" : "Sélectionner un fichier")}</div>
            <div style={{ color: T.t3, fontSize: "10.5px" }}>Formats acceptés : {doc.formats} — 10 Mo max</div>
          </div>
          <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}/>
        </div>
      )}
    </div>
  );
}

function statutBadge(statut: DocStatut, soumisLe: string | null) {
  if (statut === "valide") {
    return <Badge color={T.green} bg={T.greenL} label="Validé"/>;
  }
  if (statut === "rejete") {
    return <Badge color={T.red} bg={T.redL} label="Rejeté"/>;
  }
  if (statut === "complement_demande") {
    return <Badge color={T.orange} bg={T.orangeL} label="Complément demandé"/>;
  }
  if (statut === "recu") {
    const enExamen = soumisLe ? (Date.now() - new Date(soumisLe).getTime()) > RECU_VERS_EN_EXAMEN_MS : false;
    return <Badge color={T.blue} bg={T.blueL} label={enExamen ? "En cours d'examen" : "Reçu"}/>;
  }
  return <Badge color={T.t3} bg={T.bg3} label="À fournir"/>;
}

function Badge({ color, bg, label }: { color: string; bg: string; label: string }) {
  return (
    <span style={{ backgroundColor: bg, border: `1px solid ${color}30`, color, fontSize: "10px", fontWeight: "800", padding: "4px 10px", borderRadius: "20px", flexShrink: 0, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}
