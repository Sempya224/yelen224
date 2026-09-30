"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { SUPPORT_CATEGORIE_PUBLIC_LABELS, SUPPORT_STATUT_LABELS } from "@/lib/supportTicketsConstants";
import type { TicketPublicVue } from "@/lib/supportTickets";

type Props = { ticketInitial: TicketPublicVue };

const COULEUR = { texte: "#1a1200", muted: "#6b5000", label: "#8B6914", erreur: "#dc2626" };

const wrap: CSSProperties = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "sans-serif" };

// Client Component — le chargement initial vient du Server Component
// parent (page.tsx, appel direct à obtenirTicketParToken), tout ce qui
// suit (envoi de message, fin de conversation, rafraîchissement manuel)
// passe par les 3 routes /api/support/public/suivi* qui lisent le cookie
// httpOnly côté serveur à chaque appel — jamais le token en clair ici. Pas
// de polling automatique (aucune exigence "live" dans ce chantier V1) :
// rafraîchissement uniquement sur action explicite, cohérent avec le
// piège connu "jamais un setInterval silencieux qui remet l'écran en
// loading" (voir CLAUDE.md /pieges-techniques-connus, même s'il ne
// s'applique pas ici faute de polling du tout).
export function SuiviConversation({ ticketInitial }: Props) {
  const [ticket, setTicket] = useState(ticketInitial);
  const [texte, setTexte] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [terminaison, setTerminaison] = useState(false);
  const [erreur, setErreur] = useState("");
  const [expiree, setExpiree] = useState(false);

  const rafraichir = async () => {
    try {
      const res = await fetch("/api/support/public/suivi");
      const json = await res.json().catch(() => null) as { ok?: boolean; ticket?: TicketPublicVue } | null;
      if (res.ok && json?.ok && json.ticket) setTicket(json.ticket);
      else if (res.status === 401) setExpiree(true);
    } catch {
      // Échec de rafraîchissement silencieux — l'état affiché reste tel
      // quel, jamais une erreur bloquante pour une simple relecture.
    }
  };

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    const contenu = texte.trim();
    if (!contenu || envoi) return;
    setEnvoi(true);
    setErreur("");
    try {
      const res = await fetch("/api/support/public/suivi/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texte: contenu }),
      });
      const json = await res.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        if (res.status === 401) setExpiree(true);
        else setErreur(json?.error || "Une erreur est survenue.");
        return;
      }
      setTexte("");
      await rafraichir();
    } catch {
      setErreur("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setEnvoi(false);
    }
  };

  const terminer = async () => {
    if (terminaison) return;
    setTerminaison(true);
    setErreur("");
    try {
      const res = await fetch("/api/support/public/suivi/terminer", { method: "POST" });
      const json = await res.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        if (res.status === 401) setExpiree(true);
        else setErreur(json?.error || "Une erreur est survenue.");
        return;
      }
      await rafraichir();
    } catch {
      setErreur("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setTerminaison(false);
    }
  };

  if (expiree) {
    return (
      <div style={wrap}>
        <div style={{ maxWidth: 380, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, color: COULEUR.texte }}>Session de suivi expirée</h1>
          <p style={{ color: COULEUR.muted, marginBottom: 20, fontSize: 14, lineHeight: 1.6 }}>
            Redemandez un lien depuis l&apos;email que nous vous avons envoyé, ou écrivez-nous à nouveau.
          </p>
          <a href="/contact" style={{ color: "#F5A623", fontWeight: 700, textDecoration: "none" }}>Nous écrire à nouveau →</a>
        </div>
      </div>
    );
  }

  const peutEcrire = ticket.statut === "en_cours";
  const peutTerminer = ticket.statut === "attente_agent" || ticket.statut === "en_cours";
  const terminee = ticket.statut === "resolu" || ticket.statut === "cloture";
  const categorieLabel = SUPPORT_CATEGORIE_PUBLIC_LABELS[ticket.categorie] ?? ticket.categorie;

  return (
    <div style={{ minHeight: "100vh", padding: "32px 16px", fontFamily: "sans-serif", display: "flex", justifyContent: "center" }}>
      <div style={{ maxWidth: 560, width: "100%" }}>
        <p style={{ color: COULEUR.label, fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
          {categorieLabel} · {ticket.numero_public}
        </p>
        <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 4, color: COULEUR.texte }}>{ticket.sujet}</h1>
        <p style={{ color: COULEUR.muted, fontSize: 13, marginBottom: 24 }}>{SUPPORT_STATUT_LABELS[ticket.statut]}</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
          {ticket.messages.map(m => (
            <div
              key={m.id}
              style={{
                alignSelf: m.expediteur_type === "visiteur" ? "flex-end" : "flex-start",
                maxWidth: "80%",
                background: m.expediteur_type === "visiteur" ? "#F5A623" : "#f4efe4",
                color: COULEUR.texte,
                borderRadius: 14, padding: "10px 14px", fontSize: 14, lineHeight: 1.5,
              }}
            >
              <div>{m.contenu}</div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>{new Date(m.cree_le).toLocaleString("fr-FR")}</div>
            </div>
          ))}
        </div>

        {ticket.statut === "attente_agent" && (
          <p style={{ color: COULEUR.muted, fontSize: 13, marginBottom: 16 }}>
            Un agent Yelen va prendre en charge votre demande. Vous recevrez un email dès que ce sera fait.
          </p>
        )}
        {terminee && (
          <p style={{ color: COULEUR.muted, fontSize: 13, marginBottom: 16 }}>Cette conversation est terminée.</p>
        )}

        {peutEcrire && (
          <form onSubmit={envoyer} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input
              value={texte}
              onChange={e => setTexte(e.target.value)}
              placeholder="Écrire un message…"
              maxLength={4000}
              disabled={envoi}
              style={{ flex: 1, padding: "10px 14px", borderRadius: 12, border: "1px solid #e5d9bd", fontSize: 14 }}
            />
            <button
              type="submit"
              disabled={envoi || !texte.trim()}
              style={{
                background: envoi || !texte.trim() ? "rgba(200,140,0,0.3)" : "#F5A623",
                color: "#1a1200", fontWeight: 800, fontSize: 14, padding: "10px 20px",
                borderRadius: 12, border: "none", cursor: envoi ? "not-allowed" : "pointer",
              }}
            >
              Envoyer
            </button>
          </form>
        )}

        {erreur && <p style={{ color: COULEUR.erreur, fontSize: 13, marginBottom: 16 }}>{erreur}</p>}

        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <button onClick={rafraichir} style={{ background: "none", border: "none", color: "#F5A623", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}>
            Rafraîchir
          </button>
          {peutTerminer && (
            <button
              onClick={terminer}
              disabled={terminaison}
              style={{ background: "none", border: "none", color: COULEUR.muted, fontWeight: 700, fontSize: 13, cursor: terminaison ? "not-allowed" : "pointer", padding: 0 }}
            >
              {terminaison ? "…" : "Terminer la conversation"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
