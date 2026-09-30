"use client";

import { useEffect, useRef, useState } from "react";

type LangCode = "fr" | "en" | "ar";

// Corpus du Help Center 100% français à ce stade (5 articles) — aucune
// traduction n'existe encore, contrairement au reste du site où fr/en sont
// déjà tous les deux réels (voir i18n/locale.ts::SUPPORTED_LOCALES). Ce
// composant est donc volontairement autonome, jamais branché sur le cookie
// `yelen224_locale`/le Server Action `setLocale` du reste de l'app : changer
// la langue ici ne changerait aucun contenu de cette page (mensonger), et
// ferait basculer sans le dire le reste du site pendant que le visiteur
// pense n'agir que sur le Help Center. Français seul reste sélectionnable ;
// anglais et arabe passent tous les deux "Bientôt disponible" pour ce
// corpus précis (retour Bryan 22/09/2026 : "on ne traduit pas encore, on
// l'implante juste dans le header, donc on le prépare" — préparer l'UI
// maintenant, brancher la vraie bascule quand la traduction du corpus
// existera réellement).
const LANGUAGES: { code: LangCode; label: string; comingSoon?: boolean }[] = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English", comingSoon: true },
  { code: "ar", label: "العربية", comingSoon: true },
];

const ACTIVE: LangCode = "fr";

export function LanguageSwitcher() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="hc-lang" ref={containerRef}>
      <button
        type="button"
        className="hc-lang-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Choisir une langue"
        onClick={() => setOpen(o => !o)}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span className="hc-lang-trigger-label">FR</span>
        <svg className="hc-lang-trigger-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <ul className="hc-lang-menu" role="listbox" aria-label="Langues disponibles">
          {LANGUAGES.map(l => (
            <li key={l.code} role="option" aria-selected={l.code === ACTIVE}>
              <button
                type="button"
                className="hc-lang-option"
                disabled={l.comingSoon}
                onClick={() => { if (!l.comingSoon) setOpen(false); }}
              >
                <span lang={l.code} dir={l.code === "ar" ? "rtl" : undefined}>{l.label}</span>
                {l.comingSoon ? (
                  <span className="hc-lang-option-soon">Bientôt</span>
                ) : l.code === ACTIVE ? (
                  <svg className="hc-lang-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
