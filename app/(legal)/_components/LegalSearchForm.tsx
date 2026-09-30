"use client";

// Recherche intégrée du hero /legal, exactement dans l'esprit de
// app/guide-prestataire/components/SearchForm.tsx (retour Bryan
// 23/09/2026) : pilule, anneau doré au focus, suggestions en direct
// pendant la frappe. Adaptée au Centre légal : searchLegalDocuments()
// opère sur les 5 documents réels (lib/legalNav.ts), pas de page de
// résultats séparée (pas assez de contenu pour la justifier) — Entrée/
// clic navigue directement vers le premier document trouvé.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { searchLegalDocuments } from "@/lib/legalNav";

export function LegalSearchForm() {
  const { theme } = useTheme();
  const C = T[theme];
  const router = useRouter();
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => searchLegalDocuments(value), [value]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Affiche aussi un état "aucun résultat" (pas seulement quand il y a des
  // suggestions) — retour Bryan 23/09/2026 : avec seulement 5 documents,
  // une requête sans correspondance ("H" par ex.) ne montrait rien du
  // tout, impossible de distinguer "aucun résultat" de "la recherche ne
  // fonctionne pas".
  const showDropdown = open && value.trim().length > 0;

  function lancerRecherche() {
    const q = value.trim();
    if (!q) return;
    const [premier] = searchLegalDocuments(q);
    if (premier) {
      setOpen(false);
      router.push(premier.href);
    }
  }

  return (
    <div ref={containerRef} style={{ position: "relative", maxWidth: "440px", margin: "0 auto" }}>
      <form
        role="search"
        onSubmit={(e) => { e.preventDefault(); lancerRecherche(); }}
        style={{
          display: "flex", alignItems: "center", gap: "4px", padding: "4px",
          borderRadius: "999px", border: `1.5px solid ${C.borderCard}`, backgroundColor: C.cardBg,
          boxShadow: "0 4px 14px rgba(26,18,0,0.08)",
        }}
      >
        <label htmlFor="legal-search-q" style={{ position: "absolute", left: "-9999px" }}>
          Rechercher un document légal
        </label>

        {value && (
          <button
            type="button"
            aria-label="Effacer la recherche"
            onClick={() => setValue("")}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              width: "32px", height: "32px", padding: 0, border: "none", borderRadius: "50%",
              backgroundColor: "transparent", color: C.textFaint, cursor: "pointer", marginLeft: "2px",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

        <input
          id="legal-search-q"
          type="search"
          placeholder="Rechercher un document, une règle, un article..."
          value={value}
          onChange={(e) => { setValue(e.target.value); setOpen(true); }}
          onFocus={() => { if (value.trim()) setOpen(true); }}
          onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
          autoComplete="off"
          style={{
            flex: 1, minWidth: 0, padding: "10px 8px 10px 16px", border: "none",
            borderRadius: "999px", backgroundColor: "transparent", color: C.text, fontSize: "14px",
          }}
        />

        <button
          type="submit"
          aria-label="Lancer la recherche"
          disabled={!value.trim()}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            width: "38px", height: "38px", borderRadius: "50%", border: "none",
            backgroundColor: "#1a1200", color: "#fff",
            cursor: value.trim() ? "pointer" : "not-allowed", opacity: value.trim() ? 1 : 0.35,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      </form>

      {showDropdown && (
        <div
          aria-live="polite"
          style={{
            position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, zIndex: 60,
            backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "16px",
            boxShadow: "0 12px 32px rgba(26,18,0,0.16)", padding: "6px", textAlign: "left",
          }}
        >
          <p style={{ position: "absolute", left: "-9999px" }}>
            {suggestions.length} résultat{suggestions.length > 1 ? "s" : ""} pour « {value} »
          </p>
          {suggestions.length === 0 ? (
            <p style={{ margin: 0, padding: "14px", color: C.textFaint, fontSize: "13.5px" }}>
              Aucun document trouvé pour « {value.trim()} ».
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {suggestions.map(item => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px",
                      padding: "12px 14px", borderRadius: "10px", color: C.text, textDecoration: "none",
                      fontSize: "14px", fontWeight: 600,
                    }}
                  >
                    <span>{item.label}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textFaint} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="9 6 15 12 9 18" />
                    </svg>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
