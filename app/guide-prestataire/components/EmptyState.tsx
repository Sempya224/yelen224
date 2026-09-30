import { SupportCallout } from "./SupportCallout";
import { InstitutionCta } from "./InstitutionCta";

export function EmptyState({ titre, description }: { titre: string; description: string }) {
  return (
    <div>
      <div className="hc-empty" role="status">
        <h2 style={{ fontSize: "16px", fontWeight: 800, margin: "0 0 8px" }}>{titre}</h2>
        <p style={{ color: "var(--hc-text-muted)", fontSize: "13.5px", margin: 0, lineHeight: 1.6 }}>
          {description}
        </p>
      </div>
      <SupportCallout />
      <InstitutionCta />
    </div>
  );
}
