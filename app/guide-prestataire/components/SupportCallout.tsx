import Link from "next/link";

// Filet de sécurité support humain V1 (§8 de l'architecture) — /contact
// existant, générique. Aucun nouveau canal de ticketing créé ici.
export function SupportCallout() {
  return (
    <div className="hc-card" style={{ marginTop: "20px" }}>
      <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: "14px" }}>
        Vous ne trouvez pas de réponse ?
      </p>
      <p style={{ margin: "0 0 14px", color: "var(--hc-text-muted)", fontSize: "13px", lineHeight: 1.6 }}>
        Contactez l&apos;équipe Yelen directement — support prestataire,
        partenariat ou problème technique.
      </p>
      <Link href="/contact" className="hc-contact-link">
        Contacter le support
      </Link>
    </div>
  );
}
