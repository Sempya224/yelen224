"use client";

// Onglet Documents institutionnels — remplace l'ancien /institution/document.
// Principes non négociables (niveau gouvernemental/Stripe Connect/Doctolib) :
// l'institution ne voit JAMAIS le fichier qu'elle a envoyé, seulement un
// statut. Aucune URL, même signée, n'est jamais exposée ici. Les documents
// requis sont dérivés automatiquement de statut_juridique (déjà collecté à
// l'onboarding) — jamais de re-choix de profil. Renvoi possible uniquement
// si le document est en 'complement_demande' ou 'rejete'.
//
// Refonte visuelle 24/10/2026 (frontend uniquement) : toute la présentation
// vit dans DocumentsUi.tsx ; ici ne restent que l'état, les appels API et le
// choix de l'écran selon le statut du compte et des documents.
import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens } from "../theme";
import { Card } from "@/components/ui/Card";
import { dateHeureComplete } from "@/lib/heure";
import { HelpCenterGuide } from "./HelpCenterGuide";
import { RemerciementYelen } from "./RemerciementYelen";
import {
  BanniereEtat, DecisionsVerification, DocumentCarte, DocumentLigneValidee, DocumentsStyles, EnteteDocuments,
  ErreurDocuments, GuideStatutsDocuments, IllustrationExamen, LogoEtablissementVerifie, NoteConfidentialite, ParcoursVerification, ProgressionDocuments, SqueletteDocuments,
  type DocumentsResponse,
} from "./DocumentsUi";

export function DocumentsTab({ instId, onToast, access = "full", instName, instLogo, badgeVerifie = false, onNavigate }: {
  instId: string; onToast: (msg: string, color?: string) => void; access?: "full" | "read";
  instName?: string | null; instLogo?: string | null; badgeVerifie?: boolean;
  onNavigate?: (onglet: "disponibilites" | "services" | "codeqr" | "communaute-pro" | "profil-entreprise") => void;
}) {
  const readOnly = access === "read";
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [data, setData] = useState<DocumentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  // Erreur technique (réseau, HTTP non OK, corps illisible) distincte du
  // "Profil incomplet" : ce dernier ne s'affiche que si la donnée est bien
  // reçue ET que statut_juridique est réellement vide.
  const [erreur, setErreur] = useState(false);
  const [relance, setRelance] = useState(false);

  // `silencieux` : rafraîchissement périodique — un échec ponctuel ne remplace
  // jamais l'écran déjà affiché par l'écran d'erreur.
  const load = async (silencieux = false) => {
    try {
      const res = await fetch("/api/institution/documents");
      const j: DocumentsResponse | null = res.ok ? await res.json().catch(() => null) : null;
      if (j) { setData(j); setErreur(false); } else if (!silencieux) setErreur(true);
    } catch {
      if (!silencieux) setErreur(true);
    } finally {
      setLoading(false);
    }
  };

  const reessayer = async () => {
    setRelance(true);
    await load();
    setRelance(false);
  };

  useEffect(() => {
    load();
  }, [instId]);

  // L'onglet reste monté (KeepMounted) : sans rafraîchissement, une décision
  // de l'équipe Yelen n'apparaîtrait qu'au rechargement de la page. Tant que le
  // compte n'est pas validé, on relit toutes les 30 s (même cadence que le
  // chargement de l'établissement dans le dashboard).
  const statutCompte = data?.institution_statut;
  useEffect(() => {
    if (!statutCompte || statutCompte === "validee") return;
    const interval = setInterval(() => { if (!document.hidden) load(true); }, 30000);
    return () => clearInterval(interval);
  }, [statutCompte, instId]);

  const handleFile = async (type: string, file: File) => {
    setUploadingType(type);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", type);
      const res = await fetch("/api/institution/documents", { method: "POST", body: fd });
      const j = await res.json().catch(() => null);
      if (!res.ok) { onToast(j?.error || "Échec de l'envoi du document.", C.red); return; }
      onToast("Document envoyé — en attente d'examen.", C.green);
      load();
    } catch {
      onToast("Échec de l'envoi du document. Vérifiez votre connexion.", C.red);
    } finally {
      setUploadingType(null);
    }
  };

  if (loading) {
    return (
      <div className="dc-page" style={{ padding: "16px", paddingBottom: "100px" }}>
        <DocumentsStyles C={C}/>
        <SqueletteDocuments/>
      </div>
    );
  }

  if (erreur || !data) {
    return <ErreurDocuments C={C} relance={relance} onRetry={reessayer}/>;
  }

  if (!data.statut_juridique) {
    return (
      <div style={{ padding: "48px 16px", textAlign: "center" }}>
        <p style={{ color: C.t2, fontSize: "13px" }}>Profil incomplet — le statut juridique de l&apos;établissement n&apos;a pas encore été renseigné.</p>
      </div>
    );
  }

  const compteValide = data.institution_statut === "validee";
  const compteBloque = data.institution_statut === "refusee" || data.institution_statut === "suspendue";
  const total = data.documents.length;
  const soumis = data.documents.filter((d) => d.statut === "recu" || d.statut === "valide").length;
  const depotComplet = total > 0 && soumis === total;
  // Date du dépôt le plus récent parmi les versions actives (ISO : comparable
  // telle quelle), null si rien n'a jamais été déposé.
  const dernierDepot = data.documents.reduce<string | null>((max, d) => (d.soumis_le && (!max || d.soumis_le > max) ? d.soumis_le : max), null);

  const sousTitre = compteValide
    ? "Voici les documents retenus pour la validation de votre établissement."
    : "Ces documents permettent à Yelen224 de vérifier l'existence légale de votre établissement.";

  // Bannière d'état en tête de la colonne principale, selon le compte puis le
  // dépôt (même hiérarchie qu'avant : refusé/suspendu d'abord, jamais l'écran
  // "Merci" quand rien n'est réellement en cours d'examen).
  let banniere: React.ReactNode = null;
  if (compteValide) {
    banniere = <BanniereEtat C={C} ton="succes" illustration={<LogoEtablissementVerifie C={C} nom={instName} logo={instLogo}/>} titre="Vos documents ont été validés" texte={`Votre établissement est vérifié auprès de Yelen224${data.validee_le ? ` depuis le ${dateHeureComplete(data.validee_le)}` : ""}.`}/>;
  } else if (compteBloque) {
    const refuse = data.institution_statut === "refusee";
    // Aucun motif inventé : le motif d'un refus est communiqué par notification
    // (voir refuser/route.ts), le texte renvoie donc vers elle et le support.
    banniere = (
      <BanniereEtat C={C} ton="alerte" role="alert"
        titre={refuse ? "Votre dossier a été refusé" : "Votre espace est suspendu"}
        texte={refuse
          ? "Le motif vous a été communiqué par notification. Vous pouvez renvoyer un document uniquement lorsqu'un renvoi vous est demandé ci-dessous."
          : "Votre établissement n'est plus visible des citoyens pendant la suspension. Contactez le support pour connaître la suite à donner."}
        action={<a href="mailto:support@yelen224.com" className="yelen-focus-ring" style={{ color: C.t1, fontSize: 13, fontWeight: 600, textDecoration: "underline" }}>Contacter le support</a>}/>
    );
  } else if (depotComplet) {
    banniere = (
      <BanniereEtat C={C} ton="attente" role="status" illustration={<IllustrationExamen C={C}/>}
        titre="Merci, vos documents sont bien reçus"
        texte="Merci de l'intérêt que vous portez à Yelen et de votre patience — notre équipe vérifie actuellement ces documents. Vous serez averti par notification dès que l'examen sera terminé, aucune action supplémentaire n'est nécessaire de votre part."/>
    );
  }

  return (
    <div className="dc-page" style={{ padding: "16px", paddingBottom: "100px" }}>
      <DocumentsStyles C={C}/>
      <EnteteDocuments C={C} statut={data.institution_statut} sousTitre={sousTitre} aide={<HelpCenterGuide tab="documents" />}/>

      <div className="dc-grid">
        <div className="dc-main">
          {banniere}
          <DecisionsVerification decisions={data.decisions} C={C}/>

          {compteValide ? (
            // Compte validé : jamais les fichiers, juste les types retenus,
            // puis la section de bienvenue (uniquement dans cet état).
            <>
              <Card tokens={toCardTokens(C)} noPadding style={{ border: `1px solid ${C.border2}` }}>
                {data.documents.map((d, i) => <DocumentLigneValidee key={d.type} C={C} label={d.label} dernier={i === data.documents.length - 1}/>)}
              </Card>
              {onNavigate && <RemerciementYelen C={C} nomEtablissement={instName} badgeVerifie={badgeVerifie} onNavigate={onNavigate}/>}
            </>
          ) : (
            data.documents.map((d) => (
              <DocumentCarte
                key={d.type}
                C={C}
                doc={d}
                uploading={uploadingType === d.type}
                onPick={() => fileInputs.current[d.type]?.click()}
                inputRef={(el) => { fileInputs.current[d.type] = el; }}
                onFile={(f) => handleFile(d.type, f)}
                readOnly={readOnly}
              />
            ))
          )}
        </div>

        <aside className="dc-side" aria-label="Suivi de la vérification">
          <ProgressionDocuments C={C} soumis={compteValide ? total : soumis} total={total} compteValide={compteValide}/>
          {!compteBloque && <ParcoursVerification C={C} depotComplet={compteValide || depotComplet} compteValide={compteValide} dernierDepot={dernierDepot} valideeLe={data.validee_le ?? null}/>}
          <NoteConfidentialite C={C}/>
        </aside>
      </div>

      <GuideStatutsDocuments C={C} onOuvrirEntreprise={onNavigate ? () => onNavigate("profil-entreprise") : undefined}/>    </div>
  );
}
