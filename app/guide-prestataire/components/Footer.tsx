import Link from "next/link";

// Reprend la structure du footer public existant (app/cgu/page.tsx,
// app/confidentialite/page.tsx : brand + groupes de liens + bas de page)
// avec les tokens hc-* (jamais les hex codés en dur de ces pages-là) —
// cohérence visuelle avec le reste du Help Center, pas un nouveau système.
export function Footer() {
  return (
    <footer className="hc-footer">
      <div className="hc-footer-inner">
        <div className="hc-footer-top">
          <div className="hc-footer-brand">
            <strong>
              YELEN
              <span className="hc-footer-brand-224">
                224
                {/* Pure décoration (retour Bryan 23/09/2026) — reprend
                    juste 3 des rayons du logo (voir hc-brand-mark,
                    layout.tsx), jamais le repère complet (cercle + 8
                    rayons). Aucun sens sémantique, aria-hidden. */}
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="hc-footer-brand-star hc-footer-brand-star--1" aria-hidden="true">
                  <path d="M12 3v18" /><path d="M3 12h18" /><path d="M5.5 5.5l13 13" />
                </svg>
                <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="hc-footer-brand-star hc-footer-brand-star--2" aria-hidden="true">
                  <path d="M12 3v18" /><path d="M3 12h18" /><path d="M5.5 5.5l13 13" />
                </svg>
                <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="hc-footer-brand-star hc-footer-brand-star--3" aria-hidden="true">
                  <path d="M12 3v18" /><path d="M3 12h18" /><path d="M5.5 5.5l13 13" />
                </svg>
              </span>
            </strong>
            <span>Centre d&apos;aide</span>
          </div>

          <div className="hc-footer-groups">
            <div className="hc-footer-links-group">
              <span className="hc-footer-group-label">Centre d&apos;aide</span>
              <Link href="/guide-prestataire">Accueil du centre d&apos;aide</Link>
              <Link href="/faq">Centre d&apos;aide citoyen</Link>
              <Link href="/contact">Contacter le support</Link>
            </div>
            <div className="hc-footer-links-group">
              <span className="hc-footer-group-label">Mentions légales</span>
              <Link href="/confidentialite">Politique de confidentialité</Link>
              <Link href="/cgu">Conditions générales d&apos;utilisation</Link>
              <Link href="/politique-cookies">Politique des cookies</Link>
            </div>
            <div className="hc-footer-links-group">
              <span className="hc-footer-group-label">Éditeur</span>
              <a href="https://sempya224.com" target="_blank" rel="noreferrer">Sempya224</a>
              <a href="mailto:contact@yelen224.com">contact@yelen224.com</a>
            </div>
          </div>
        </div>

        <div className="hc-footer-bottom">
          © {new Date().getFullYear()} YELEN224 — Sempya224. Tous droits réservés.
        </div>
      </div>
    </footer>
  );
}
