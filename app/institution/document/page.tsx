"use client";

import { useState, useEffect, useRef } from "react";
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

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,300&family=DM+Serif+Display:ital@0;1&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --gold: #F5A623;
    --gold-dim: rgba(245,166,35,0.12);
    --gold-border: rgba(245,166,35,0.2);
    --bg: #080810;
    --surface: #0E0E1C;
    --surface-2: #141426;
    --border: rgba(255,255,255,0.06);
    --border-hover: rgba(245,166,35,0.35);
    --text: #F0EFE8;
    --text-muted: #6B6A7A;
    --text-dim: #3A3A52;
    --green: #10B981;
    --green-dim: rgba(16,185,129,0.1);
    --green-border: rgba(16,185,129,0.25);
    --red: #EF4444;
    --red-dim: rgba(239,68,68,0.08);
    --red-border: rgba(239,68,68,0.25);
    --blue: #60A5FA;
    --blue-dim: rgba(96,165,250,0.08);
    --blue-border: rgba(96,165,250,0.2);
  }

  body { background: var(--bg); font-family: 'DM Sans', sans-serif; color: var(--text); }

  .page-wrap {
    min-height: 100vh;
    background: var(--bg);
    position: relative;
    overflow-x: hidden;
  }

  /* Subtle ambient noise */
  .page-wrap::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image:
      radial-gradient(ellipse 80% 60% at 50% -10%, rgba(245,166,35,0.06) 0%, transparent 70%),
      radial-gradient(ellipse 40% 40% at 90% 80%, rgba(96,165,250,0.04) 0%, transparent 60%);
    pointer-events: none;
    z-index: 0;
  }

  /* ── HEADER ── */
  .header {
    position: sticky;
    top: 0;
    z-index: 100;
    background: rgba(8,8,16,0.85);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border-bottom: 1px solid var(--border);
  }
  .header-inner {
    max-width: 760px;
    margin: 0 auto;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
  }
  .header-left { display: flex; align-items: center; gap: 16px; }
  .back-btn {
    width: 36px; height: 36px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--surface);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    color: var(--text-muted);
    text-decoration: none;
    transition: border-color 0.2s, color 0.2s, background 0.2s;
  }
  .back-btn:hover { border-color: var(--gold-border); color: var(--gold); background: var(--gold-dim); }
  .logo {
    font-family: 'DM Serif Display', serif;
    font-size: 20px;
    color: var(--gold);
    letter-spacing: 0.02em;
  }
  .logo span { color: var(--text-muted); font-family: 'DM Sans', sans-serif; font-size: 11px; font-weight: 400; letter-spacing: 0.05em; margin-left: 4px; vertical-align: middle; }
  .badge-verif {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--gold);
    background: var(--gold-dim);
    border: 1px solid var(--gold-border);
    padding: 5px 14px;
    border-radius: 100px;
  }

  /* ── MAIN ── */
  .main {
    position: relative;
    z-index: 1;
    max-width: 760px;
    margin: 0 auto;
    padding: 48px 24px 80px;
  }

  /* ── HERO BLOCK ── */
  .hero {
    margin-bottom: 40px;
  }
  .hero-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--gold);
    margin-bottom: 16px;
  }
  .hero-eyebrow-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--gold);
    animation: pulse-dot 2s ease-in-out infinite;
  }
  @keyframes pulse-dot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.7); }
  }
  .hero-title {
    font-family: 'DM Serif Display', serif;
    font-size: clamp(26px, 5vw, 36px);
    font-weight: 400;
    color: var(--text);
    line-height: 1.15;
    margin-bottom: 16px;
    letter-spacing: -0.01em;
  }
  .hero-title em {
    font-style: italic;
    color: var(--gold);
  }
  .hero-sub {
    font-size: 14px;
    line-height: 1.75;
    color: var(--text-muted);
    max-width: 560px;
  }
  .hero-category-tag {
    display: inline-block;
    color: var(--text);
    background: var(--gold-dim);
    border: 1px solid var(--gold-border);
    border-radius: 6px;
    padding: 2px 10px;
    font-weight: 600;
    font-size: 13px;
  }

  /* ── PROGRESS ── */
  .progress-section {
    margin-bottom: 32px;
  }
  .progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }
  .progress-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
    letter-spacing: 0.04em;
  }
  .progress-count {
    font-size: 12px;
    font-weight: 700;
    color: var(--gold);
    font-variant-numeric: tabular-nums;
  }
  .progress-track {
    height: 4px;
    border-radius: 100px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    border-radius: 100px;
    background: linear-gradient(90deg, #F5A623 0%, #FFD97A 100%);
    transition: width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
    position: relative;
  }
  .progress-fill::after {
    content: '';
    position: absolute;
    right: 0; top: 0; bottom: 0;
    width: 40px;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3));
    animation: shimmer 1.5s ease-in-out infinite;
  }
  @keyframes shimmer {
    0% { opacity: 0; } 50% { opacity: 1; } 100% { opacity: 0; }
  }

  /* ── SECURITY BANNER ── */
  .security-banner {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    background: var(--blue-dim);
    border: 1px solid var(--blue-border);
    border-radius: 14px;
    padding: 18px 20px;
    margin-bottom: 36px;
  }
  .security-icon {
    width: 38px; height: 38px;
    border-radius: 10px;
    background: rgba(96,165,250,0.12);
    border: 1px solid rgba(96,165,250,0.25);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .security-text-title {
    font-size: 12px;
    font-weight: 700;
    color: var(--blue);
    letter-spacing: 0.04em;
    margin-bottom: 5px;
  }
  .security-text-body {
    font-size: 12px;
    line-height: 1.65;
    color: rgba(147,197,253,0.65);
  }
  .security-pills {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 10px;
  }
  .security-pill {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--blue);
    background: rgba(96,165,250,0.1);
    border: 1px solid rgba(96,165,250,0.2);
    padding: 3px 10px;
    border-radius: 100px;
  }

  /* ── DOCS ── */
  .docs-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 32px;
  }

  .doc-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 24px;
    transition: border-color 0.25s, box-shadow 0.25s;
  }
  .doc-card:has(.upload-zone:hover) {
    border-color: var(--gold-border);
    box-shadow: 0 0 0 1px rgba(245,166,35,0.08), 0 8px 32px rgba(0,0,0,0.25);
  }
  .doc-card.uploaded {
    border-color: var(--green-border);
    background: linear-gradient(135deg, var(--surface) 0%, rgba(16,185,129,0.04) 100%);
  }

  .doc-card-header {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    margin-bottom: 18px;
  }
  .doc-index {
    width: 32px; height: 32px;
    border-radius: 10px;
    background: var(--gold-dim);
    border: 1px solid var(--gold-border);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    font-size: 12px;
    font-weight: 800;
    color: var(--gold);
    font-variant-numeric: tabular-nums;
  }
  .doc-index.done {
    background: var(--green-dim);
    border-color: var(--green-border);
    color: var(--green);
  }
  .doc-meta { flex: 1; }
  .doc-label-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 6px;
  }
  .doc-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    line-height: 1.3;
  }
  .badge-oblig {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--red);
    background: var(--red-dim);
    border: 1px solid var(--red-border);
    padding: 2px 8px;
    border-radius: 100px;
    white-space: nowrap;
  }
  .badge-optionnel {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-dim);
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    padding: 2px 8px;
    border-radius: 100px;
    white-space: nowrap;
  }
  .doc-description {
    font-size: 12px;
    line-height: 1.65;
    color: var(--text-muted);
    margin-bottom: 6px;
  }
  .doc-formats {
    font-size: 11px;
    color: var(--text-dim);
  }
  .doc-formats span { color: var(--gold); font-weight: 500; }

  /* ── UPLOAD ZONE ── */
  .upload-zone {
    display: flex;
    align-items: center;
    gap: 16px;
    border: 1.5px dashed rgba(255,255,255,0.1);
    border-radius: 12px;
    padding: 16px;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
    position: relative;
    overflow: hidden;
  }
  .upload-zone:hover {
    border-color: rgba(245,166,35,0.4);
    background: rgba(245,166,35,0.03);
  }
  .upload-zone.has-file {
    border-color: var(--green-border);
    background: var(--green-dim);
    border-style: solid;
  }

  .upload-thumb {
    width: 48px; height: 48px;
    border-radius: 10px;
    flex-shrink: 0;
    overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .upload-thumb.has-file {
    border-color: var(--green-border);
    background: var(--green-dim);
  }
  .upload-thumb img {
    width: 100%; height: 100%;
    object-fit: cover;
  }
  .upload-thumb-pdf {
    font-size: 10px;
    font-weight: 900;
    color: var(--red);
    letter-spacing: 0.05em;
  }
  .upload-thumb-icon {
    color: var(--gold);
    opacity: 0.7;
  }
  .upload-info { flex: 1; min-width: 0; }
  .upload-filename {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 3px;
  }
  .upload-filename.has-file { color: var(--green); }
  .upload-hint {
    font-size: 11px;
    color: var(--text-dim);
  }
  .upload-check {
    width: 28px; height: 28px;
    border-radius: 50%;
    background: var(--green-dim);
    border: 1px solid var(--green-border);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    color: var(--green);
    font-size: 13px;
  }
  .upload-arrow {
    width: 28px; height: 28px;
    border-radius: 50%;
    background: var(--gold-dim);
    border: 1px solid var(--gold-border);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    color: var(--gold);
    font-size: 13px;
    transition: background 0.2s;
  }
  .upload-zone:hover .upload-arrow {
    background: rgba(245,166,35,0.2);
  }

  /* ── ERROR ── */
  .error-box {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    background: var(--red-dim);
    border: 1px solid var(--red-border);
    border-left: 3px solid var(--red);
    border-radius: 12px;
    padding: 14px 18px;
    margin-bottom: 20px;
    animation: slideIn 0.3s ease;
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateY(-6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .error-text {
    font-size: 13px;
    line-height: 1.6;
    color: #FCA5A5;
  }

  /* ── SUBMIT BUTTON ── */
  .submit-wrapper {
    position: relative;
  }
  .submit-btn {
    width: 100%;
    background: var(--gold);
    color: #080810;
    border: none;
    border-radius: 14px;
    padding: 17px 24px;
    font-family: 'DM Sans', sans-serif;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    letter-spacing: 0.02em;
    position: relative;
    overflow: hidden;
    transition: opacity 0.2s, transform 0.1s;
  }
  .submit-btn:not(:disabled):hover { opacity: 0.92; transform: translateY(-1px); }
  .submit-btn:not(:disabled):active { transform: translateY(0); }
  .submit-btn:disabled {
    background: var(--surface-2);
    color: var(--text-dim);
    cursor: not-allowed;
  }
  .submit-btn::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%);
    transform: translateX(-100%);
    animation: btn-shine 2.5s ease-in-out infinite;
  }
  .submit-btn:disabled::before { display: none; }
  @keyframes btn-shine {
    0% { transform: translateX(-100%); }
    30%, 100% { transform: translateX(200%); }
  }
  .submit-loading {
    display: flex; align-items: center; justify-content: center; gap: 10px;
  }
  .spinner {
    width: 16px; height: 16px;
    border: 2px solid rgba(8,8,16,0.2);
    border-top-color: #080810;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .submit-disclaimer {
    font-size: 11px;
    color: var(--text-dim);
    text-align: center;
    margin-top: 14px;
    line-height: 1.65;
  }

  /* ── SUCCESS ── */
  .success-wrap {
    min-height: 100vh;
    background: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px 24px;
    position: relative;
  }
  .success-wrap::before {
    content: '';
    position: fixed;
    inset: 0;
    background: radial-gradient(ellipse 60% 50% at 50% 40%, rgba(16,185,129,0.07) 0%, transparent 70%);
    pointer-events: none;
  }
  .success-card {
    max-width: 480px;
    width: 100%;
    text-align: center;
    position: relative;
    z-index: 1;
  }
  .success-icon-wrap {
    width: 88px; height: 88px;
    border-radius: 50%;
    background: var(--green-dim);
    border: 1.5px solid var(--green-border);
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 28px;
    position: relative;
  }
  .success-icon-wrap::before {
    content: '';
    position: absolute;
    inset: -8px;
    border-radius: 50%;
    border: 1px solid rgba(16,185,129,0.12);
  }
  .success-icon-wrap::after {
    content: '';
    position: absolute;
    inset: -16px;
    border-radius: 50%;
    border: 1px solid rgba(16,185,129,0.06);
  }
  .success-title {
    font-family: 'DM Serif Display', serif;
    font-size: 28px;
    color: var(--text);
    margin-bottom: 12px;
    line-height: 1.2;
  }
  .success-sub {
    font-size: 14px;
    line-height: 1.75;
    color: var(--text-muted);
    margin-bottom: 36px;
  }
  .steps-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    overflow: hidden;
    margin-bottom: 28px;
    text-align: left;
  }
  .steps-header {
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--gold);
    background: var(--gold-dim);
  }
  .step-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 13px 20px;
    border-bottom: 1px solid var(--border);
  }
  .step-row:last-child { border-bottom: none; }
  .step-num {
    width: 24px; height: 24px;
    border-radius: 50%;
    background: var(--gold-dim);
    border: 1px solid var(--gold-border);
    display: flex; align-items: center; justify-content: center;
    font-size: 10px;
    font-weight: 800;
    color: var(--gold);
    flex-shrink: 0;
  }
  .step-text {
    font-size: 13px;
    color: #9090A8;
    line-height: 1.4;
  }
  .success-btn {
    width: 100%;
    background: var(--gold);
    color: #080810;
    border: none;
    border-radius: 14px;
    padding: 16px;
    font-family: 'DM Sans', sans-serif;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    letter-spacing: 0.02em;
    transition: opacity 0.2s;
  }
  .success-btn:hover { opacity: 0.9; }

  /* ── LOADING ── */
  .page-loading {
    min-height: 100vh;
    background: var(--bg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20px;
  }
  .loading-ring {
    width: 44px; height: 44px;
    border: 2px solid var(--border);
    border-top-color: var(--gold);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  .loading-text {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-dim);
  }

  /* ── RESPONSIVE ── */
  @media (max-width: 480px) {
    .main { padding: 32px 16px 60px; }
    .header-inner { padding: 0 16px; }
    .doc-card { padding: 18px; }
    .security-banner { flex-direction: column; gap: 12px; }
  }
`;

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

  const docs = DOCUMENTS_PAR_CATEGORIE[category || "Autre"] || [];
  const uploadedCount = docs.filter((d) => files[d.label]).length;
  const totalCount = docs.length;
  const progressPercent = totalCount > 0 ? Math.round((uploadedCount / totalCount) * 100) : 0;

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
    const obligatoires = docs.filter((d) => d.obligatoire);
    const manquants = obligatoires.filter((d) => !files[d.label]);

    if (manquants.length > 0) {
      setError(
        manquants.length === 1
          ? `Le document suivant est obligatoire : « ${manquants[0].label} »`
          : `${manquants.length} documents obligatoires manquants : ${manquants.map((d) => `« ${d.label} »`).join(", ")}`
      );
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
      setError("Une erreur est survenue lors de l'envoi. Vérifiez votre connexion et réessayez.");
    } finally {
      setLoading(false);
    }
  };

  if (loadingCategory) return (
    <>
      <style>{CSS}</style>
      <div className="page-loading">
        <div className="loading-ring" />
        <p className="loading-text">Chargement du dossier</p>
      </div>
    </>
  );

  if (submitted) return (
    <>
      <style>{CSS}</style>
      <div className="success-wrap">
        <div className="success-card">
          <div className="success-icon-wrap">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M7 16.5L13 22.5L25 10" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="success-title">Dossier soumis<br/>avec succès</h1>
          <p className="success-sub">
            Votre dossier est en cours d&apos;examen par l&apos;équipe de vérification de Yelen224.
            Ce processus prend généralement entre <strong>24 et 72 heures ouvrables</strong>.
            Vous serez notifié par SMS une fois la décision rendue.
          </p>
          <div className="steps-card">
            <div className="steps-header">Prochaines étapes</div>
            {[
              "Examen du dossier par l'équipe Yelen224",
              "Vérification des documents soumis",
              "Notification par SMS de la décision",
              "Activation de votre espace institution",
            ].map((step, i) => (
              <div key={i} className="step-row">
                <div className="step-num">{i + 1}</div>
                <span className="step-text">{step}</span>
              </div>
            ))}
          </div>
          <button className="success-btn" onClick={() => router.push("/institution/dashboard")}>
            Retour au tableau de bord
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <style>{CSS}</style>
      <div className="page-wrap">
        {/* HEADER */}
        <header className="header">
          <div className="header-inner">
            <div className="header-left">
              <a href="/institution/dashboard" className="back-btn" title="Retour">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
              <div className="logo">
                Yelen<span style={{color:"#F5A623", fontFamily:"'DM Serif Display',serif", fontSize:"20px"}}>224</span>
              </div>
            </div>
            <span className="badge-verif">Vérification</span>
          </div>
        </header>

        <main className="main">
          {/* HERO */}
          <div className="hero">
            <div className="hero-eyebrow">
              <div className="hero-eyebrow-dot" />
              Dossier de vérification officielle
            </div>
            <h1 className="hero-title">
              Authentifiez votre<br/><em>établissement</em>
            </h1>
            <p className="hero-sub">
              Pour garantir la confiance des citoyens guinéens, Yelen224 vérifie l&apos;authenticité de chaque structure. Les documents requis pour votre catégorie&nbsp;: <span className="hero-category-tag">{category}</span>
            </p>
          </div>

          {/* PROGRESS */}
          <div className="progress-section">
            <div className="progress-header">
              <span className="progress-label">Documents téléversés</span>
              <span className="progress-count">{uploadedCount} / {totalCount}</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>

          {/* SECURITY BANNER */}
          <div className="security-banner">
            <div className="security-icon">
              <svg width="18" height="20" viewBox="0 0 18 20" fill="none">
                <path d="M9 1L1.5 4.5V9.5C1.5 13.6 4.8 17.4 9 18.5C13.2 17.4 16.5 13.6 16.5 9.5V4.5L9 1Z" stroke="#60A5FA" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M6 10L8 12L12 8" stroke="#60A5FA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <p className="security-text-title">Sécurité & Confidentialité des données</p>
              <p className="security-text-body">
                Vos documents sont chiffrés en transit et au repos. Ils ne sont accessibles qu&apos;aux agents de vérification habilités de Yelen224, en conformité avec la réglementation guinéenne sur la protection des données personnelles.
              </p>
              <div className="security-pills">
                <span className="security-pill">Chiffrement TLS 1.3</span>
                <span className="security-pill">Accès restreint</span>
                <span className="security-pill">Traçabilité complète</span>
                <span className="security-pill">Données en Guinée</span>
              </div>
            </div>
          </div>

          {/* DOCUMENTS */}
          <div className="docs-list">
            {docs.map((doc, i) => {
              const hasFile = !!files[doc.label];
              const preview = previews[doc.label];
              return (
                <div key={i} className={`doc-card${hasFile ? " uploaded" : ""}`}>
                  <div className="doc-card-header">
                    <div className={`doc-index${hasFile ? " done" : ""}`}>
                      {hasFile
                        ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7L6 10L11 4" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        : String(i + 1).padStart(2, "0")
                      }
                    </div>
                    <div className="doc-meta">
                      <div className="doc-label-row">
                        <span className="doc-label">{doc.label}</span>
                        {doc.obligatoire
                          ? <span className="badge-oblig">Obligatoire</span>
                          : <span className="badge-optionnel">Optionnel</span>
                        }
                      </div>
                      <p className="doc-description">{doc.description}</p>
                      <p className="doc-formats">Formats&nbsp;: <span>{doc.formats}</span></p>
                    </div>
                  </div>

                  <label className={`upload-zone${hasFile ? " has-file" : ""}`}>
                    <div className={`upload-thumb${hasFile ? " has-file" : ""}`}>
                      {preview === "pdf" ? (
                        <span className="upload-thumb-pdf">PDF</span>
                      ) : preview ? (
                        <img src={preview} alt="aperçu" />
                      ) : (
                        <svg className="upload-thumb-icon" width="20" height="20" viewBox="0 0 20 20" fill="none">
                          <path d="M10 14V6M10 6L7 9M10 6L13 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <rect x="3" y="3" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                        </svg>
                      )}
                    </div>
                    <div className="upload-info">
                      <p className={`upload-filename${hasFile ? " has-file" : ""}`}>
                        {hasFile ? files[doc.label]!.name : "Sélectionner un fichier"}
                      </p>
                      <p className="upload-hint">
                        {hasFile
                          ? `${(files[doc.label]!.size / 1024 / 1024).toFixed(2)} MB`
                          : "PDF, JPG ou PNG — 10 MB max"
                        }
                      </p>
                    </div>
                    {hasFile
                      ? <div className="upload-check">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </div>
                      : <div className="upload-arrow">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 9V3M6 3L3.5 5.5M6 3L8.5 5.5" stroke="#F5A623" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </div>
                    }
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => handleFile(doc.label, e)} style={{ display: "none" }} />
                  </label>
                </div>
              );
            })}
          </div>

          {/* ERROR */}
          {error && (
            <div className="error-box">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{flexShrink:0, marginTop:2}}>
                <circle cx="8" cy="8" r="7" stroke="#EF4444" strokeWidth="1.5"/>
                <path d="M8 5V8.5" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="8" cy="11" r="0.75" fill="#EF4444"/>
              </svg>
              <p className="error-text">{error}</p>
            </div>
          )}

          {/* SUBMIT */}
          <div className="submit-wrapper">
            <button className="submit-btn" onClick={handleSubmit} disabled={loading}>
              {loading ? (
                <span className="submit-loading">
                  <span className="spinner" />
                  Envoi en cours…
                </span>
              ) : "Soumettre le dossier pour vérification"}
            </button>
            <p className="submit-disclaimer">
              En soumettant ce dossier, vous certifiez que les documents fournis sont authentiques et vous engagez à respecter les conditions d&apos;utilisation de la plateforme Yelen224.
            </p>
          </div>
        </main>
      </div>
    </>
  );
}