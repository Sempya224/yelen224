"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────
interface DocSpec {
  label: string;
  description: string;
  formats: string;
  obligatoire: boolean;
}

// ─── Documents par catégorie ──────────────────────────────────────────────────
const DOCUMENTS_PAR_CATEGORIE: Record<string, DocSpec[]> = {
  "Hopital / Clinique": [
    { label: "Autorisation d'exercice du Ministère de la Santé", description: "Document officiel délivré par le Ministère de la Santé Publique de Guinée autorisant l'établissement à exercer.", formats: "PDF, JPG, PNG", obligatoire: true },
    { label: "Registre de Commerce (RCCM)", description: "Extrait du registre de commerce et du crédit mobilier.", formats: "PDF", obligatoire: true },
    { label: "Carte d'identification fiscale (NIF)", description: "Numéro d'Identification Fiscale délivré par la Direction Nationale des Impôts.", formats: "PDF, JPG", obligatoire: true },
  ],
  "Ecole / Universite": [
    { label: "Arrêté ministériel d'ouverture", description: "Arrêté du Ministère de l'Éducation Nationale ou de l'Enseignement Supérieur autorisant l'ouverture.", formats: "PDF", obligatoire: true },
    { label: "Registre de Commerce (RCCM)", description: "Extrait du registre de commerce.", formats: "PDF", obligatoire: true },
    { label: "Carte d'identification fiscale (NIF)", description: "Numéro d'Identification Fiscale.", formats: "PDF, JPG", obligatoire: true },
  ],
  "Mairie / Administration": [
    { label: "Arrêté de création ou décret officiel", description: "Document officiel attestant la création et l'existence légale de l'entité administrative.", formats: "PDF", obligatoire: true },
    { label: "Lettre d'autorisation du responsable hiérarchique", description: "Lettre signée par l'autorité de tutelle autorisant l'enregistrement sur la plateforme.", formats: "PDF", obligatoire: true },
  ],
  "Banque / Microfinance": [
    { label: "Agrément de la Banque Centrale de la République de Guinée (BCRG)", description: "Autorisation officielle de la BCRG pour exercer une activité bancaire ou de microfinance.", formats: "PDF", obligatoire: true },
    { label: "Registre de Commerce (RCCM)", description: "Extrait du registre de commerce.", formats: "PDF", obligatoire: true },
    { label: "Carte d'identification fiscale (NIF)", description: "Numéro d'Identification Fiscale.", formats: "PDF, JPG", obligatoire: true },
  ],
  "Pharmacie": [
    { label: "Autorisation d'exercice — Ordre National des Pharmaciens", description: "Document délivré par l'Ordre National des Pharmaciens de Guinée.", formats: "PDF, JPG", obligatoire: true },
    { label: "Registre de Commerce (RCCM)", description: "Extrait du registre de commerce.", formats: "PDF", obligatoire: true },
    { label: "Carte d'identification fiscale (NIF)", description: "Numéro d'Identification Fiscale.", formats: "PDF, JPG", obligatoire: true },
  ],
  "Cabinet medical": [
    { label: "Autorisation d'exercice privé — Ministère de la Santé", description: "Autorisation officielle pour exercer la médecine en cabinet privé en Guinée.", formats: "PDF, JPG", obligatoire: true },
    { label: "Diplôme et inscription à l'Ordre des Médecins", description: "Copie du diplôme et attestation d'inscription à l'Ordre National des Médecins de Guinée.", formats: "PDF, JPG", obligatoire: true },
  ],
  "Tribunal / Justice": [
    { label: "Arrêté de création du Ministère de la Justice", description: "Document officiel attestant la création et la juridiction de l'entité judiciaire.", formats: "PDF", obligatoire: true },
    { label: "Lettre d'autorisation du Ministre de la Justice", description: "Autorisation formelle pour l'enregistrement sur la plateforme Yelen224.", formats: "PDF", obligatoire: true },
  ],
  "Transport / Logistique": [
    { label: "Licence de transport — Ministère des Transports", description: "Licence officielle délivrée par le Ministère des Transports et des Infrastructures.", formats: "PDF", obligatoire: true },
    { label: "Registre de Commerce (RCCM)", description: "Extrait du registre de commerce.", formats: "PDF", obligatoire: true },
    { label: "Carte d'identification fiscale (NIF)", description: "Numéro d'Identification Fiscale.", formats: "PDF, JPG", obligatoire: true },
  ],
  "ONG / Association": [
    { label: "Récépissé de déclaration au Ministère de l'Administration du Territoire", description: "Document officiel attestant la reconnaissance légale de l'ONG ou association en Guinée.", formats: "PDF", obligatoire: true },
    { label: "Statuts de l'organisation", description: "Copie des statuts signés et enregistrés.", formats: "PDF", obligatoire: true },
    { label: "Procès-verbal de l'assemblée constitutive", description: "PV signé de la réunion fondatrice de l'organisation.", formats: "PDF", obligatoire: false },
  ],
  "Autre": [
    { label: "Document officiel d'identification de la structure", description: "Tout document officiel prouvant l'existence légale et l'identité de votre établissement (RCCM, arrêté, décret, etc.).", formats: "PDF, JPG, PNG", obligatoire: true },
    { label: "Carte d'identification fiscale (NIF)", description: "Numéro d'Identification Fiscale délivré par les autorités guinéennes.", formats: "PDF, JPG", obligatoire: false },
  ],
};

// ─── CSS Global ───────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --gold: #D4A017;
    --gold-deep: #B8860B;
    --gold-light: #F5C842;
    --gold-bg: rgba(212,160,23,0.06);
    --gold-border: rgba(212,160,23,0.18);
    --gold-border-strong: rgba(212,160,23,0.35);
    --black: #0A0A0A;
    --gray-900: #111111;
    --gray-800: #1A1A1A;
    --gray-700: #2A2A2A;
    --gray-600: #3D3D3D;
    --gray-500: #666666;
    --gray-400: #888888;
    --gray-300: #B8B8B8;
    --gray-200: #D9D9D9;
    --gray-100: #F0F0F0;
    --gray-50: #F8F8F8;
    --white: #FFFFFF;
    --green: #16A34A;
    --green-bg: rgba(22,163,74,0.06);
    --green-border: rgba(22,163,74,0.2);
    --red: #DC2626;
    --red-bg: rgba(220,38,38,0.06);
    --red-border: rgba(220,38,38,0.2);
    --blue: #2563EB;
    --blue-bg: rgba(37,99,235,0.06);
    --blue-border: rgba(37,99,235,0.18);
    --radius-sm: 8px;
    --radius-md: 12px;
    --radius-lg: 16px;
    --radius-xl: 20px;
    --radius-2xl: 24px;
  }

  body {
    background: var(--white);
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    color: var(--black);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  .app { min-height: 100vh; background: var(--white); }

  /* ── STICKY PROGRESS TOP ── */
  .sticky-top {
    position: sticky;
    top: 0;
    z-index: 100;
    background: rgba(255,255,255,0.96);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--gray-100);
  }
  .progress-bar-line {
    height: 3px;
    background: var(--gray-100);
  }
  .progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--gold-deep), var(--gold-light));
    transition: width 0.5s cubic-bezier(0.4,0,0.2,1);
  }
  .top-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
  }
  .logo-mark {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .logo-square {
    width: 32px; height: 32px;
    background: var(--gold);
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
  }
  .logo-text {
    font-size: 15px;
    font-weight: 800;
    color: var(--black);
    letter-spacing: -0.3px;
  }
  .logo-text span { color: var(--gold-deep); }
  .badge-etat {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--gold-deep);
    background: var(--gold-bg);
    border: 1px solid var(--gold-border);
    padding: 4px 12px;
    border-radius: 100px;
  }
  .progress-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px 14px;
  }
  .progress-label-text {
    font-size: 11px;
    font-weight: 600;
    color: var(--gray-400);
    letter-spacing: 0.04em;
  }
  .progress-count-text {
    font-size: 11px;
    font-weight: 700;
    color: var(--gold-deep);
  }

  /* ── MAIN ── */
  .main { padding: 0 20px 120px; max-width: 520px; margin: 0 auto; }

  /* ── PAGE TITLE BLOCK ── */
  .page-title-block {
    padding: 28px 0 24px;
    border-bottom: 1px solid var(--gray-100);
    margin-bottom: 28px;
  }
  .page-eyebrow {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 10px;
  }
  .eyebrow-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--gold);
    animation: blink 2s ease-in-out infinite;
  }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
  .eyebrow-text {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--gold-deep);
  }
  .page-h1 {
    font-size: 26px;
    font-weight: 800;
    color: var(--black);
    letter-spacing: -0.6px;
    line-height: 1.15;
    margin-bottom: 10px;
  }
  .page-sub {
    font-size: 13px;
    line-height: 1.7;
    color: var(--gray-500);
  }
  .category-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: var(--gold-bg);
    border: 1px solid var(--gold-border);
    border-radius: 100px;
    padding: 3px 10px;
    font-size: 12px;
    font-weight: 700;
    color: var(--gold-deep);
    margin-top: 8px;
  }

  /* ── SECTION CARD ── */
  .section-card {
    background: var(--white);
    border: 1px solid var(--gray-100);
    border-radius: var(--radius-xl);
    overflow: hidden;
    margin-bottom: 12px;
  }
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--gray-100);
    background: var(--gray-50);
  }
  .section-title {
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--gray-600);
  }
  .section-body { padding: 20px; }

  /* ── WHY SECTION ── */
  .why-block {
    background: var(--gray-50);
    border: 1px solid var(--gray-100);
    border-radius: var(--radius-xl);
    padding: 20px;
    margin-bottom: 12px;
  }
  .why-icon-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }
  .why-icon {
    width: 40px; height: 40px;
    border-radius: var(--radius-md);
    background: var(--gold-bg);
    border: 1px solid var(--gold-border);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .why-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--black);
  }
  .why-body {
    font-size: 12.5px;
    line-height: 1.75;
    color: var(--gray-500);
  }
  .why-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 14px;
  }
  .why-pill {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--gray-600);
    background: var(--white);
    border: 1px solid var(--gray-200);
    padding: 4px 10px;
    border-radius: 100px;
  }

  /* ── ACCORD SECTION ── */
  .accord-block {
    background: var(--white);
    border: 1px solid var(--gray-100);
    border-radius: var(--radius-xl);
    overflow: hidden;
    margin-bottom: 12px;
  }
  .accord-header-gold {
    background: var(--gold-bg);
    border-bottom: 1px solid var(--gold-border);
    padding: 14px 20px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .accord-title-text {
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--gold-deep);
  }
  .accord-body { padding: 20px; }
  .accord-party {
    margin-bottom: 20px;
  }
  .accord-party:last-child { margin-bottom: 0; }
  .accord-party-label {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--gray-400);
    margin-bottom: 10px;
  }
  .accord-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid var(--gray-50);
  }
  .accord-item:last-child { border-bottom: none; }
  .accord-bullet {
    width: 18px; height: 18px;
    border-radius: 50%;
    background: var(--gold-bg);
    border: 1px solid var(--gold-border);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    margin-top: 1px;
  }
  .accord-bullet-green {
    background: var(--green-bg);
    border-color: var(--green-border);
  }
  .accord-text {
    font-size: 12.5px;
    line-height: 1.6;
    color: var(--gray-600);
  }
  .accord-divider {
    height: 1px;
    background: var(--gray-100);
    margin: 20px 0;
    position: relative;
  }
  .accord-divider::after {
    content: 'ET';
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%,-50%);
    background: var(--white);
    padding: 0 10px;
    font-size: 10px;
    font-weight: 800;
    color: var(--gray-300);
    letter-spacing: 0.1em;
  }

  /* ── DOCUMENTS ── */
  .docs-section { margin-bottom: 12px; }
  .docs-section-title {
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--gray-400);
    padding: 0 4px;
    margin-bottom: 10px;
    margin-top: 24px;
  }
  .doc-card {
    background: var(--white);
    border: 1px solid var(--gray-100);
    border-radius: var(--radius-xl);
    overflow: hidden;
    margin-bottom: 8px;
    transition: border-color 0.2s;
  }
  .doc-card.is-uploaded {
    border-color: var(--green-border);
  }
  .doc-card-top {
    padding: 16px 20px 14px;
  }
  .doc-num-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .doc-num {
    width: 24px; height: 24px;
    border-radius: 50%;
    background: var(--gray-100);
    display: flex; align-items: center; justify-content: center;
    font-size: 11px;
    font-weight: 800;
    color: var(--gray-500);
    flex-shrink: 0;
    margin-top: 1px;
  }
  .doc-num.done {
    background: var(--green-bg);
    color: var(--green);
  }
  .doc-info { flex: 1; }
  .doc-label-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 5px;
  }
  .doc-label {
    font-size: 13.5px;
    font-weight: 700;
    color: var(--black);
    line-height: 1.3;
  }
  .badge-req {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--red);
    background: var(--red-bg);
    border: 1px solid var(--red-border);
    padding: 2px 7px;
    border-radius: 100px;
  }
  .badge-opt {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--gray-400);
    background: var(--gray-50);
    border: 1px solid var(--gray-200);
    padding: 2px 7px;
    border-radius: 100px;
  }
  .doc-desc {
    font-size: 12px;
    line-height: 1.65;
    color: var(--gray-400);
    margin-bottom: 5px;
  }
  .doc-formats {
    font-size: 11px;
    color: var(--gray-300);
  }
  .doc-formats b { color: var(--gold-deep); font-weight: 700; }

  /* ── UPLOAD ZONE ── */
  .upload-zone {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 0 12px 12px;
    border: 1.5px dashed var(--gray-200);
    border-radius: var(--radius-lg);
    padding: 14px;
    cursor: pointer;
    transition: border-color 0.2s, background 0.15s;
    position: relative;
  }
  .upload-zone:hover {
    border-color: var(--gold-border-strong);
    background: var(--gold-bg);
  }
  .upload-zone.filled {
    border-style: solid;
    border-color: var(--green-border);
    background: var(--green-bg);
  }
  .upload-thumb {
    width: 44px; height: 44px;
    border-radius: var(--radius-md);
    background: var(--gray-100);
    flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
  }
  .upload-thumb.filled {
    background: rgba(22,163,74,0.08);
  }
  .upload-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .upload-thumb-pdf {
    font-size: 9px;
    font-weight: 900;
    color: var(--red);
    letter-spacing: 0.06em;
  }
  .upload-info { flex: 1; min-width: 0; }
  .upload-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--black);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 2px;
  }
  .upload-name.filled { color: var(--green); }
  .upload-hint {
    font-size: 11px;
    color: var(--gray-300);
  }
  .upload-action {
    width: 30px; height: 30px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .upload-action.arrow {
    background: var(--gold-bg);
    border: 1px solid var(--gold-border);
  }
  .upload-action.check {
    background: var(--green-bg);
    border: 1px solid var(--green-border);
  }

  /* ── DOC CUSTOM ── */
  .doc-custom-section {
    background: var(--white);
    border: 1px solid var(--gray-100);
    border-radius: var(--radius-xl);
    overflow: hidden;
    margin-bottom: 12px;
  }
  .doc-custom-header {
    padding: 14px 20px;
    border-bottom: 1px solid var(--gray-100);
    background: var(--gray-50);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .doc-custom-title {
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--gray-600);
  }
  .doc-custom-body { padding: 20px; }
  .custom-upload-empty {
    border: 1.5px dashed var(--gray-200);
    border-radius: var(--radius-lg);
    padding: 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
    transition: border-color 0.2s, background 0.15s;
  }
  .custom-upload-empty:hover {
    border-color: var(--gold-border-strong);
    background: var(--gold-bg);
  }
  .custom-add-icon {
    width: 40px; height: 40px;
    border-radius: 50%;
    background: var(--gray-100);
    display: flex; align-items: center; justify-content: center;
  }
  .custom-add-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--gray-500);
  }
  .custom-add-hint {
    font-size: 11px;
    color: var(--gray-300);
  }
  .custom-file-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--gray-50);
  }
  .custom-file-row:last-child { border-bottom: none; }
  .custom-file-thumb {
    width: 36px; height: 36px;
    border-radius: var(--radius-sm);
    background: var(--gray-100);
    flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
  }
  .custom-file-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .custom-file-info { flex: 1; min-width: 0; }
  .custom-file-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--black);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .custom-file-size {
    font-size: 11px;
    color: var(--gray-400);
  }
  .custom-file-remove {
    width: 26px; height: 26px;
    border-radius: 50%;
    background: var(--gray-100);
    border: none;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    transition: background 0.15s;
  }
  .custom-file-remove:hover { background: var(--red-bg); }

  /* ── CONTACT SECTION ── */
  .contact-section {
    background: var(--white);
    border: 1px solid var(--gray-100);
    border-radius: var(--radius-xl);
    overflow: hidden;
    margin-bottom: 12px;
  }
  .contact-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 20px;
    border-bottom: 1px solid var(--gray-50);
    transition: background 0.15s;
    cursor: pointer;
    text-decoration: none;
  }
  .contact-row:last-child { border-bottom: none; }
  .contact-row:hover { background: var(--gray-50); }
  .contact-icon {
    width: 38px; height: 38px;
    border-radius: var(--radius-md);
    background: var(--gray-100);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .contact-info { flex: 1; }
  .contact-label {
    font-size: 13px;
    font-weight: 700;
    color: var(--black);
    margin-bottom: 2px;
  }
  .contact-val {
    font-size: 12px;
    color: var(--gray-400);
  }

  /* ── ERROR BOX ── */
  .error-box {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    background: var(--red-bg);
    border: 1px solid var(--red-border);
    border-radius: var(--radius-lg);
    padding: 14px 16px;
    margin-bottom: 16px;
    animation: slideUp 0.25s ease;
  }
  @keyframes slideUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  .error-text {
    font-size: 13px;
    line-height: 1.6;
    color: var(--red);
    font-weight: 500;
  }

  /* ── STICKY BOTTOM SUBMIT ── */
  .sticky-bottom {
    position: fixed;
    bottom: 0;
    left: 0; right: 0;
    z-index: 100;
    background: rgba(255,255,255,0.97);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-top: 1px solid var(--gray-100);
    padding: 16px 20px;
    padding-bottom: max(16px, env(safe-area-inset-bottom));
  }
  .submit-btn {
    width: 100%;
    background: var(--black);
    color: var(--white);
    border: none;
    border-radius: var(--radius-lg);
    padding: 16px 24px;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    letter-spacing: -0.2px;
    transition: opacity 0.15s, transform 0.1s;
    position: relative;
    overflow: hidden;
  }
  .submit-btn:not(:disabled):hover { opacity: 0.88; }
  .submit-btn:not(:disabled):active { transform: scale(0.99); }
  .submit-btn:disabled {
    background: var(--gray-200);
    color: var(--gray-400);
    cursor: not-allowed;
  }
  .submit-btn-gold {
    background: var(--gold);
    color: var(--black);
  }
  .submit-btn-gold:not(:disabled):hover { opacity: 0.9; }
  .spinner-sm {
    width: 16px; height: 16px;
    border: 2px solid rgba(255,255,255,0.25);
    border-top-color: var(--white);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to{transform:rotate(360deg)} }
  .submit-hint {
    font-size: 11px;
    color: var(--gray-400);
    text-align: center;
    margin-top: 8px;
    line-height: 1.5;
  }

  /* ── PREVIEW MODAL ── */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.55);
    z-index: 200;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }
  .modal-sheet {
    background: var(--white);
    border-radius: 24px 24px 0 0;
    max-height: 92vh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    animation: sheetUp 0.35s cubic-bezier(0.34,1.56,0.64,1);
  }
  @keyframes sheetUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
  .sheet-handle {
    width: 36px; height: 4px;
    background: var(--gray-200);
    border-radius: 100px;
    margin: 14px auto 0;
  }
  .sheet-header {
    padding: 20px 20px 16px;
    border-bottom: 1px solid var(--gray-100);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .sheet-title {
    font-size: 16px;
    font-weight: 800;
    color: var(--black);
    letter-spacing: -0.3px;
  }
  .sheet-close {
    width: 30px; height: 30px;
    border-radius: 50%;
    background: var(--gray-100);
    border: none;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .sheet-body { padding: 20px; }

  /* Preview accord */
  .preview-logo-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--gray-100);
  }
  .preview-logo-sq {
    width: 40px; height: 40px;
    background: var(--gold);
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
  }
  .preview-brand {
    font-size: 14px;
    font-weight: 800;
    color: var(--black);
  }
  .preview-brand span { color: var(--gold-deep); }
  .preview-brand-sub {
    font-size: 11px;
    color: var(--gray-400);
    font-weight: 500;
  }
  .preview-field {
    margin-bottom: 14px;
  }
  .preview-field-label {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--gray-300);
    margin-bottom: 4px;
  }
  .preview-field-value {
    font-size: 13px;
    font-weight: 600;
    color: var(--black);
  }
  .preview-docs-list {
    margin-top: 16px;
  }
  .preview-doc-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid var(--gray-50);
  }
  .preview-doc-row:last-child { border-bottom: none; }
  .preview-doc-check {
    width: 18px; height: 18px;
    border-radius: 50%;
    background: var(--green-bg);
    border: 1px solid var(--green-border);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .preview-doc-name {
    font-size: 12px;
    color: var(--gray-600);
    font-weight: 500;
    flex: 1;
  }
  .preview-accord-block {
    background: var(--gold-bg);
    border: 1px solid var(--gold-border);
    border-radius: var(--radius-lg);
    padding: 16px;
    margin-top: 16px;
    margin-bottom: 16px;
  }
  .preview-accord-title {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--gold-deep);
    margin-bottom: 8px;
  }
  .preview-accord-text {
    font-size: 12px;
    line-height: 1.7;
    color: var(--gray-600);
  }
  .preview-timestamp {
    font-size: 11px;
    color: var(--gray-400);
    text-align: center;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--gray-100);
  }
  .preview-submit-btn {
    width: 100%;
    background: var(--black);
    color: var(--white);
    border: none;
    border-radius: var(--radius-lg);
    padding: 16px;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    margin-top: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    transition: opacity 0.15s;
  }
  .preview-submit-btn:hover { opacity: 0.88; }
  .preview-download-btn {
    width: 100%;
    background: transparent;
    color: var(--gold-deep);
    border: 1.5px solid var(--gold-border-strong);
    border-radius: var(--radius-lg);
    padding: 14px;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    margin-top: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: background 0.15s;
  }
  .preview-download-btn:hover { background: var(--gold-bg); }

  /* ── SUCCESS ── */
  .success-screen {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 24px;
    background: var(--white);
  }
  .success-inner { max-width: 360px; width: 100%; text-align: center; }
  .success-check-ring {
    width: 80px; height: 80px;
    border-radius: 50%;
    background: var(--green-bg);
    border: 1.5px solid var(--green-border);
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 24px;
  }
  .success-h1 {
    font-size: 24px;
    font-weight: 800;
    color: var(--black);
    letter-spacing: -0.5px;
    margin-bottom: 10px;
  }
  .success-sub {
    font-size: 13px;
    line-height: 1.75;
    color: var(--gray-500);
    margin-bottom: 28px;
  }
  .success-steps {
    background: var(--gray-50);
    border: 1px solid var(--gray-100);
    border-radius: var(--radius-xl);
    overflow: hidden;
    margin-bottom: 24px;
    text-align: left;
  }
  .success-step-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--gray-100);
  }
  .success-step-row:last-child { border-bottom: none; }
  .success-step-num {
    width: 22px; height: 22px;
    border-radius: 50%;
    background: var(--gold-bg);
    border: 1px solid var(--gold-border);
    display: flex; align-items: center; justify-content: center;
    font-size: 10px;
    font-weight: 800;
    color: var(--gold-deep);
    flex-shrink: 0;
  }
  .success-step-text { font-size: 12.5px; color: var(--gray-500); font-weight: 500; }
  .success-btn {
    width: 100%;
    background: var(--black);
    color: var(--white);
    border: none;
    border-radius: var(--radius-lg);
    padding: 16px;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .success-btn:hover { opacity: 0.88; }

  /* ── LOADING ── */
  .loading-screen {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    background: var(--white);
  }
  .loading-ring {
    width: 36px; height: 36px;
    border: 2.5px solid var(--gray-100);
    border-top-color: var(--gold);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  .loading-text {
    font-size: 12px;
    font-weight: 600;
    color: var(--gray-400);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  @media (max-width: 390px) {
    .main { padding: 0 16px 120px; }
    .page-h1 { font-size: 22px; }
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────
export default function DocumentOfficiel() {
  const router = useRouter();

  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [customFiles, setCustomFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [loadingCategory, setLoadingCategory] = useState(true);
  const [institutionName, setInstitutionName] = useState("");
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [accordAccepted, setAccordAccepted] = useState(false);
  const customInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (typeof window === "undefined") return;
      const id = localStorage.getItem("yelen224_institution_id");
      if (!id) { router.push("/institution/inscription"); return; }
      setInstitutionId(id);

      const { data } = await supabase
        .from("institutions")
        .select("category, name")
        .eq("id", id)
        .single();

      setCategory(data?.category || "Autre");
      setInstitutionName(data?.name || "Votre établissement");
      setLoadingCategory(false);
    };
    fetchData();
  }, [router]);

  const docs = DOCUMENTS_PAR_CATEGORIE[category || "Autre"] || [];
  const uploadedCount = docs.filter((d) => files[d.label]).length + customFiles.length;
  const totalRequired = docs.filter((d) => d.obligatoire).length;
  const uploadedRequired = docs.filter((d) => d.obligatoire && files[d.label]).length;
  const progressPercent = totalRequired > 0 ? Math.round((uploadedRequired / totalRequired) * 100) : 0;
  const allRequiredDone = uploadedRequired === totalRequired;

  const now = new Date();
  const dateStr = now.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const timeStr = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

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

  const handleCustomFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCustomFiles((prev) => [...prev, file]);
    if (e.target) e.target.value = "";
  };

  const removeCustomFile = (idx: number) => {
    setCustomFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handlePreview = () => {
    setError("");
    const manquants = docs.filter((d) => d.obligatoire && !files[d.label]);
    if (manquants.length > 0) {
      setError(
        manquants.length === 1
          ? `Document obligatoire manquant : « ${manquants[0].label} »`
          : `${manquants.length} documents obligatoires manquants.`
      );
      return;
    }
    if (!accordAccepted) {
      setError("Veuillez accepter les engagements de la Charte Yelen224 avant de continuer.");
      return;
    }
    setShowPreview(true);
  };

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      if (!institutionId) throw new Error("Session expirée");

      const uploadedUrls: string[] = [];

      // Upload docs requis
      for (const [label, file] of Object.entries(files)) {
        if (!file) continue;
        const ext = file.name.split(".").pop();
        const safeName = label.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase().substring(0, 50);
        const path = `documents/${institutionId}/${safeName}_${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(path, file, { upsert: true });
        if (uploadError) throw new Error(`Upload échoué: ${uploadError.message}`);
        const { data: urlData } = supabase.storage.from("documents").getPublicUrl(path);
        uploadedUrls.push(urlData.publicUrl);
      }

      // Upload docs custom
      for (const file of customFiles) {
        const ext = file.name.split(".").pop();
        const safeName = file.name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase().substring(0, 40);
        const path = `documents/${institutionId}/custom_${safeName}_${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(path, file, { upsert: true });
        if (uploadError) throw new Error(`Upload custom échoué: ${uploadError.message}`);
        const { data: urlData } = supabase.storage.from("documents").getPublicUrl(path);
        uploadedUrls.push(urlData.publicUrl);
      }

      // Sauvegarde en base
      const { error: updateError } = await supabase
        .from("institutions")
        .update({
          document_officiel: uploadedUrls[0] || null,
          documents_urls: uploadedUrls,
          statut: "en_attente",
        })
        .eq("id", institutionId);

      if (updateError) throw new Error(`DB update: ${updateError.message}`);

      setShowPreview(false);
      setSubmitted(true);
    } catch (err: any) {
      setError(`Erreur : ${err.message || "Vérifiez votre connexion et réessayez."}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loadingCategory) return (
    <>
      <style>{CSS}</style>
      <div className="loading-screen">
        <div className="loading-ring" />
        <p className="loading-text">Chargement</p>
      </div>
    </>
  );

  // ── Success ──────────────────────────────────────────────────────────────────
  if (submitted) return (
    <>
      <style>{CSS}</style>
      <div className="success-screen">
        <div className="success-inner">
          <div className="success-check-ring">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M6 14.5L11.5 20L22 9" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="success-h1">Dossier soumis</h1>
          <p className="success-sub">
            Votre dossier est en cours d&apos;examen par l&apos;équipe de vérification Yelen224.
            Délai habituel : <strong>24 à 72 heures ouvrables</strong>.
            Notification par SMS à réception de la décision.
          </p>
          <div className="success-steps">
            {["Réception et accusé du dossier", "Examen par l'équipe Yelen224", "Vérification des documents officiels", "Notification SMS de la décision", "Activation de l'espace institution"].map((s, i) => (
              <div key={i} className="success-step-row">
                <div className="success-step-num">{i + 1}</div>
                <span className="success-step-text">{s}</span>
              </div>
            ))}
          </div>
          <button className="success-btn" onClick={() => router.push(`/institution/${institutionId}/dashboard`)}>
            Retour au tableau de bord
          </button>
        </div>
      </div>
    </>
  );

  // ── Main render ──────────────────────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>
      <div className="app">

        {/* ── STICKY TOP ── */}
        <div className="sticky-top">
          <div className="progress-bar-line">
            <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="top-header">
            <div className="logo-mark">
              <div className="logo-square">
                <svg width="16" height="18" viewBox="0 0 16 18" fill="none">
                  <path d="M8 1L14.5 4.5V9C14.5 13 11.5 16.5 8 17.5C4.5 16.5 1.5 13 1.5 9V4.5L8 1Z" fill="white" fillOpacity="0.9"/>
                </svg>
              </div>
              <div>
                <div className="logo-text">Yelen<span>224</span></div>
              </div>
            </div>
            <span className="badge-etat">Vérification État</span>
          </div>
          <div className="progress-meta">
            <span className="progress-label-text">Documents obligatoires</span>
            <span className="progress-count-text">{uploadedRequired} / {totalRequired}</span>
          </div>
        </div>

        <main className="main">

          {/* ── TITRE ── */}
          <div className="page-title-block">
            <div className="page-eyebrow">
              <div className="eyebrow-dot" />
              <span className="eyebrow-text">Dossier officiel de vérification</span>
            </div>
            <h1 className="page-h1">Authentifiez votre établissement</h1>
            <p className="page-sub">
              Pour protéger les citoyens guinéens, Yelen224 vérifie l&apos;authenticité de chaque structure avant activation.
            </p>
            <div className="category-chip">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <circle cx="5" cy="5" r="4.5" stroke="#B8860B" strokeWidth="1"/>
                <circle cx="5" cy="5" r="2" fill="#B8860B"/>
              </svg>
              {category}
            </div>
          </div>

          {/* ── POURQUOI CES DOCUMENTS ── */}
          <div className="why-block">
            <div className="why-icon-row">
              <div className="why-icon">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M9 1L16 4.5V9C16 13.5 12.5 17.5 9 18.5C5.5 17.5 2 13.5 2 9V4.5L9 1Z" stroke="#B8860B" strokeWidth="1.4" strokeLinejoin="round"/>
                  <path d="M6.5 9L8 10.5L11.5 7" stroke="#B8860B" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="why-title">Pourquoi ces documents ?</div>
            </div>
            <p className="why-body">
              Yelen224 est une plateforme officielle au service de l&apos;État guinéen et de ses citoyens.
              La vérification des documents garantit que seuls des établissements légalement reconnus peuvent proposer des rendez-vous.
              Cela protège les usagers contre les structures fictives et assure la crédibilité du service public numérique.
            </p>
            <div className="why-pills">
              <span className="why-pill">Chiffrement TLS 1.3</span>
              <span className="why-pill">Accès restreint</span>
              <span className="why-pill">Usage unique</span>
              <span className="why-pill">Données en Guinée</span>
              <span className="why-pill">Conformité RGPD</span>
            </div>
          </div>

          {/* ── ENGAGEMENTS ── */}
          <div className="accord-block">
            <div className="accord-header-gold">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1L12.5 3.5V7C12.5 10.5 9.5 13.5 7 14.5C4.5 13.5 1.5 10.5 1.5 7V3.5L7 1Z" stroke="#B8860B" strokeWidth="1.3" strokeLinejoin="round"/>
              </svg>
              <span className="accord-title-text">Charte d&apos;engagement Yelen224</span>
            </div>
            <div className="accord-body">

              {/* Institution */}
              <div className="accord-party">
                <div className="accord-party-label">L&apos;institution s&apos;engage à</div>
                {[
                  "Fournir des services conformes aux standards de qualité Yelen224",
                  "Traiter les citoyens avec égalité absolue — sans discrimination de race, religion, genre, ethnie ou statut social",
                  "Respecter les horaires et disponibilités publiés sur la plateforme",
                  "Notifier Yelen224 de toute modification d&apos;activité ou de fermeture",
                  "Maintenir des informations exactes et à jour sur leur profil",
                  "Garantir la confidentialité des données personnelles des usagers",
                ].map((item, i) => (
                  <div key={i} className="accord-item">
                    <div className="accord-bullet">
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1.5 4L3.5 6L6.5 2" stroke="#B8860B" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <span className="accord-text" dangerouslySetInnerHTML={{__html: item}} />
                  </div>
                ))}
              </div>

              <div className="accord-divider" />

              {/* Citoyen */}
              <div className="accord-party">
                <div className="accord-party-label">Le citoyen s&apos;engage à</div>
                {[
                  "Se présenter aux rendez-vous confirmés ou annuler dans les délais",
                  "Fournir des informations exactes lors de la prise de rendez-vous",
                  "Respecter les règles et le personnel de l&apos;établissement",
                  "Utiliser la plateforme de manière honnête et responsable",
                ].map((item, i) => (
                  <div key={i} className="accord-item">
                    <div className="accord-bullet accord-bullet-green">
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1.5 4L3.5 6L6.5 2" stroke="#16A34A" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <span className="accord-text" dangerouslySetInnerHTML={{__html: item}} />
                  </div>
                ))}
              </div>

              {/* Checkbox accord */}
              <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginTop: "20px", cursor: "pointer", padding: "14px", background: accordAccepted ? "rgba(22,163,74,0.05)" : "var(--gray-50)", borderRadius: "var(--radius-lg)", border: `1px solid ${accordAccepted ? "var(--green-border)" : "var(--gray-200)"}`, transition: "all 0.2s" }}>
                <div
                  onClick={() => setAccordAccepted(v => !v)}
                  style={{ width: "20px", height: "20px", borderRadius: "6px", border: `1.5px solid ${accordAccepted ? "var(--green)" : "var(--gray-300)"}`, background: accordAccepted ? "var(--green)" : "var(--white)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px", transition: "all 0.2s", cursor: "pointer" }}
                >
                  {accordAccepted && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5L4.5 7.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span style={{ fontSize: "12.5px", lineHeight: "1.6", color: "var(--gray-600)", fontWeight: "500" }}>
                  Je certifie avoir lu et j&apos;accepte la Charte d&apos;engagement Yelen224. Je m&apos;engage à respecter l&apos;ensemble de ces conditions au nom de mon établissement.
                </span>
              </label>
            </div>
          </div>

          {/* ── DOCUMENTS ── */}
          <div className="docs-section">
            <div className="docs-section-title">Documents requis pour {category}</div>
            {docs.map((doc, i) => {
              const hasFile = !!files[doc.label];
              const preview = previews[doc.label];
              return (
                <div key={i} className={`doc-card${hasFile ? " is-uploaded" : ""}`}>
                  <div className="doc-card-top">
                    <div className="doc-num-row">
                      <div className={`doc-num${hasFile ? " done" : ""}`}>
                        {hasFile ? (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 5L4.5 7.5L8 3" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : String(i + 1).padStart(2, "0")}
                      </div>
                      <div className="doc-info">
                        <div className="doc-label-row">
                          <span className="doc-label">{doc.label}</span>
                          {doc.obligatoire
                            ? <span className="badge-req">Obligatoire</span>
                            : <span className="badge-opt">Optionnel</span>
                          }
                        </div>
                        <p className="doc-desc">{doc.description}</p>
                        <p className="doc-formats">Formats acceptés : <b>{doc.formats}</b> — 10 Mo max</p>
                      </div>
                    </div>
                  </div>

                  <label className={`upload-zone${hasFile ? " filled" : ""}`}>
                    <div className={`upload-thumb${hasFile ? " filled" : ""}`}>
                      {preview === "pdf" ? (
                        <span className="upload-thumb-pdf">PDF</span>
                      ) : preview ? (
                        <img src={preview} alt="" />
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                          <path d="M9 13V5M9 5L6 8M9 5L12 8" stroke="#B8B8B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <rect x="2" y="2" width="14" height="14" rx="3" stroke="#D9D9D9" strokeWidth="1.2"/>
                        </svg>
                      )}
                    </div>
                    <div className="upload-info">
                      <p className={`upload-name${hasFile ? " filled" : ""}`}>
                        {hasFile ? files[doc.label]!.name : "Sélectionner un fichier"}
                      </p>
                      <p className="upload-hint">
                        {hasFile
                          ? `${(files[doc.label]!.size / 1024 / 1024).toFixed(2)} Mo`
                          : "Appuyer pour choisir"}
                      </p>
                    </div>
                    <div className={`upload-action ${hasFile ? "check" : "arrow"}`}>
                      {hasFile ? (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M6 9V3M6 3L3.5 5.5M6 3L8.5 5.5" stroke="#B8860B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => handleFile(doc.label, e)} style={{ display: "none" }} />
                  </label>
                </div>
              );
            })}
          </div>

          {/* ── DOCUMENTS SUPPLÉMENTAIRES ── */}
          <div className="doc-custom-section">
            <div className="doc-custom-header">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="6" stroke="#666" strokeWidth="1.2"/>
                <path d="M7 4V10M4 7H10" stroke="#666" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              <span className="doc-custom-title">Documents supplémentaires</span>
            </div>
            <div className="doc-custom-body">
              <p style={{ fontSize: "12px", color: "var(--gray-400)", lineHeight: "1.65", marginBottom: "14px" }}>
                Votre profil ne correspond pas exactement aux catégories proposées ? Ajoutez ici tout document complémentaire qui atteste de votre existence légale (RCCM, décret, agrément spécial, etc.).
              </p>
              {customFiles.length > 0 && (
                <div style={{ marginBottom: "12px" }}>
                  {customFiles.map((f, i) => (
                    <div key={i} className="custom-file-row">
                      <div className="custom-file-thumb">
                        {f.type.startsWith("image/") ? (
                          <img src={URL.createObjectURL(f)} alt="" />
                        ) : (
                          <span style={{ fontSize: "8px", fontWeight: "900", color: "var(--red)" }}>PDF</span>
                        )}
                      </div>
                      <div className="custom-file-info">
                        <p className="custom-file-name">{f.name}</p>
                        <p className="custom-file-size">{(f.size / 1024 / 1024).toFixed(2)} Mo</p>
                      </div>
                      <button className="custom-file-remove" onClick={() => removeCustomFile(i)}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M2.5 2.5L7.5 7.5M7.5 2.5L2.5 7.5" stroke="#666" strokeWidth="1.4" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label className="custom-upload-empty" onClick={() => customInputRef.current?.click()}>
                <div className="custom-add-icon">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M9 4V14M4 9H14" stroke="#888" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <p className="custom-add-label">Ajouter un document</p>
                <p className="custom-add-hint">PDF, JPG, PNG — 10 Mo max</p>
              </label>
              <input ref={customInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleCustomFile} style={{ display: "none" }} />
            </div>
          </div>

          {/* ── CONTACT YELEN AVANT ENVOI ── */}
          <div className="contact-section">
            <div className="section-header">
              <span className="section-title">Besoin d&apos;aide avant d&apos;envoyer ?</span>
            </div>
            <a href="https://wa.me/224000000000?text=Bonjour%20Yelen224%2C%20j%27ai%20une%20question%20sur%20la%20v%C3%A9rification%20de%20mon%20dossier." className="contact-row" target="_blank" rel="noopener noreferrer">
              <div className="contact-icon" style={{ background: "rgba(37,211,102,0.08)" }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M9 1.5C4.86 1.5 1.5 4.86 1.5 9C1.5 10.35 1.86 11.61 2.49 12.69L1.5 16.5L5.43 15.54C6.48 16.11 7.7 16.5 9 16.5C13.14 16.5 16.5 13.14 16.5 9C16.5 4.86 13.14 1.5 9 1.5Z" stroke="#25D366" strokeWidth="1.3" strokeLinejoin="round"/>
                  <path d="M6.5 8.5C6.5 8.5 7 10 9.5 11.5C12 13 13 12 13 12" stroke="#25D366" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="contact-info">
                <p className="contact-label">WhatsApp Yelen224</p>
                <p className="contact-val">Réponse en moins de 24h</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 3L9 7L5 11" stroke="#B8B8B8" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
            <a href="mailto:verification@yelen224.com?subject=Question%20sur%20la%20v%C3%A9rification%20de%20dossier" className="contact-row" target="_blank" rel="noopener noreferrer">
              <div className="contact-icon" style={{ background: "var(--blue-bg)" }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <rect x="2" y="4" width="14" height="10" rx="2" stroke="#2563EB" strokeWidth="1.3"/>
                  <path d="M2 6L9 10L16 6" stroke="#2563EB" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="contact-info">
                <p className="contact-label">Email officiel</p>
                <p className="contact-val">verification@yelen224.com</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 3L9 7L5 11" stroke="#B8B8B8" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
            <a href="tel:+224000000000" className="contact-row">
              <div className="contact-icon" style={{ background: "rgba(212,160,23,0.08)" }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M3.5 3.5H6.5L8 7L6.5 8C7.5 10 9.5 11.5 11 12.5L12 11L16 12.5V15.5C16 15.5 13 17 9 13C5 9 3.5 5 3.5 5V3.5Z" stroke="#B8860B" strokeWidth="1.3" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="contact-info">
                <p className="contact-label">Ligne directe Yelen224</p>
                <p className="contact-val">+224 000 000 000</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 3L9 7L5 11" stroke="#B8B8B8" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          </div>

          {/* ── ERROR ── */}
          {error && (
            <div className="error-box">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
                <circle cx="8" cy="8" r="7" stroke="#DC2626" strokeWidth="1.4"/>
                <path d="M8 5V8.5" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="8" cy="11" r="0.8" fill="#DC2626"/>
              </svg>
              <p className="error-text">{error}</p>
            </div>
          )}

        </main>

        {/* ── STICKY BOTTOM ── */}
        <div className="sticky-bottom">
          <button
            className={`submit-btn${allRequiredDone && accordAccepted ? "" : ""}`}
            onClick={handlePreview}
            style={{ background: allRequiredDone && accordAccepted ? "var(--black)" : "var(--gray-200)", color: allRequiredDone && accordAccepted ? "var(--white)" : "var(--gray-400)" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1L14 4.5V8.5C14 12.5 11 15.5 8 16.5C5 15.5 2 12.5 2 8.5V4.5L8 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              <path d="M5.5 8L7.5 10L10.5 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Prévisualiser et soumettre
          </button>
          <p className="submit-hint">
            {!allRequiredDone
              ? `${totalRequired - uploadedRequired} document(s) obligatoire(s) manquant(s)`
              : !accordAccepted
              ? "Acceptez la Charte pour continuer"
              : "Vos documents seront examinés par l'équipe Yelen224"
            }
          </p>
        </div>

        {/* ── PREVIEW MODAL ── */}
        {showPreview && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowPreview(false); }}>
            <div className="modal-sheet">
              <div className="sheet-handle" />
              <div className="sheet-header">
                <span className="sheet-title">Récapitulatif du dossier</span>
                <button className="sheet-close" onClick={() => setShowPreview(false)}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 2L10 10M10 2L2 10" stroke="#666" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
              <div className="sheet-body">

                {/* Branding preview */}
                <div className="preview-logo-row">
                  <div className="preview-logo-sq">
                    <svg width="20" height="22" viewBox="0 0 20 22" fill="none">
                      <path d="M10 1L18 5V10C18 16 14 20 10 21.5C6 20 2 16 2 10V5L10 1Z" fill="white" fillOpacity="0.9"/>
                    </svg>
                  </div>
                  <div>
                    <div className="preview-brand">Yelen<span>224</span></div>
                    <div className="preview-brand-sub">Dossier de vérification officielle</div>
                  </div>
                </div>

                {/* Infos */}
                <div className="preview-field">
                  <div className="preview-field-label">Établissement</div>
                  <div className="preview-field-value">{institutionName}</div>
                </div>
                <div className="preview-field">
                  <div className="preview-field-label">Catégorie</div>
                  <div className="preview-field-value">{category}</div>
                </div>
                <div className="preview-field">
                  <div className="preview-field-label">Date et heure de soumission</div>
                  <div className="preview-field-value">{dateStr} à {timeStr}</div>
                </div>
                <div className="preview-field">
                  <div className="preview-field-label">Référence dossier</div>
                  <div className="preview-field-value" style={{ fontFamily: "monospace", fontSize: "12px", color: "var(--gray-500)" }}>YLN-{institutionId?.slice(0, 8).toUpperCase()}-{Date.now().toString().slice(-6)}</div>
                </div>

                {/* Docs soumis */}
                <div style={{ marginTop: "16px" }}>
                  <div style={{ fontSize: "10px", fontWeight: "800", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--gray-300)", marginBottom: "8px" }}>
                    Documents soumis ({Object.values(files).filter(Boolean).length + customFiles.length})
                  </div>
                  <div className="preview-docs-list">
                    {docs.filter(d => files[d.label]).map((doc, i) => (
                      <div key={i} className="preview-doc-row">
                        <div className="preview-doc-check">
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                            <path d="M1.5 4L3.5 6L6.5 2.5" stroke="#16A34A" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <span className="preview-doc-name">{doc.label}</span>
                        <span style={{ fontSize: "10px", color: "var(--gray-300)", fontWeight: "600" }}>
                          {(files[doc.label]!.size / 1024 / 1024).toFixed(1)} Mo
                        </span>
                      </div>
                    ))}
                    {customFiles.map((f, i) => (
                      <div key={`c${i}`} className="preview-doc-row">
                        <div className="preview-doc-check">
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                            <path d="M1.5 4L3.5 6L6.5 2.5" stroke="#16A34A" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <span className="preview-doc-name">{f.name} <span style={{ color: "var(--gray-300)", fontSize: "10px" }}>(document supplémentaire)</span></span>
                        <span style={{ fontSize: "10px", color: "var(--gray-300)", fontWeight: "600" }}>
                          {(f.size / 1024 / 1024).toFixed(1)} Mo
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Accord résumé */}
                <div className="preview-accord-block">
                  <div className="preview-accord-title">Accord bilatéral Yelen224</div>
                  <p className="preview-accord-text">
                    En soumettant ce dossier, <strong>{institutionName}</strong> certifie que les documents fournis sont authentiques et s&apos;engage à respecter la Charte d&apos;engagement Yelen224 — incluant l&apos;égalité de traitement de tous les citoyens, le respect des standards de service et la conformité aux conditions de la plateforme.
                  </p>
                </div>

                {/* Timestamp officiel */}
                <div className="preview-timestamp">
                  Accord enregistré le {dateStr} à {timeStr}<br/>
                  Dossier traité sous 24 à 72h ouvrables · Notification par SMS
                </div>

                {/* Erreur dans modal */}
                {error && (
                  <div className="error-box" style={{ marginTop: "16px" }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                      <circle cx="7" cy="7" r="6" stroke="#DC2626" strokeWidth="1.2"/>
                      <path d="M7 4.5V7.5" stroke="#DC2626" strokeWidth="1.3" strokeLinecap="round"/>
                      <circle cx="7" cy="9.5" r="0.7" fill="#DC2626"/>
                    </svg>
                    <p className="error-text">{error}</p>
                  </div>
                )}

                {/* Actions */}
                <button
                  className="preview-download-btn"
                  onClick={() => {
                    const content = `YELEN224 — DOSSIER DE VÉRIFICATION OFFICIELLE\n\nÉtablissement : ${institutionName}\nCatégorie : ${category}\nDate : ${dateStr} à ${timeStr}\nRéférence : YLN-${institutionId?.slice(0,8).toUpperCase()}\n\nDOCUMENTS SOUMIS :\n${docs.filter(d=>files[d.label]).map(d=>`• ${d.label}`).join('\n')}${customFiles.length > 0 ? '\n' + customFiles.map(f=>`• ${f.name} (supplémentaire)`).join('\n') : ''}\n\nENGAGEMENTS :\nL'établissement certifie que les documents fournis sont authentiques et s'engage à respecter la Charte Yelen224.\n\n© Yelen224 — Plateforme officielle de prise de rendez-vous en République de Guinée`;
                    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `Yelen224_Dossier_${institutionId?.slice(0,8)}_${Date.now()}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M7 1V9M7 9L4.5 6.5M7 9L9.5 6.5" stroke="#B8860B" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M2 11H12" stroke="#B8860B" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                  Télécharger le récapitulatif
                </button>

                <button className="preview-submit-btn" onClick={handleSubmit} disabled={loading}>
                  {loading ? (
                    <>
                      <div className="spinner-sm" />
                      Envoi en cours…
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M2 8L6 12L14 4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Confirmer et soumettre le dossier
                    </>
                  )}
                </button>

              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}