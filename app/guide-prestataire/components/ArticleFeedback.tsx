"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Article } from "@/lib/helpCenter/types";
import { YelenLoader } from "@/components/YelenLoader";

const COMMENTAIRE_MAX = 1000;

type Etat = "initial" | "formulaire_negatif" | "envoi" | "envoye" | "erreur";

function cleStockage(article: Article): string {
  return `yelen224_help_feedback_${article.domaine}_${article.id}`;
}

// Module de feedback "cet article vous a-t-il aidé ?" (retour Bryan
// 23/09/2026) — placé après les articles associés, avant SupportCallout
// (voir [domaine]/[article]/page.tsx). Client Component : vote + formulaire
// négatif exigent de l'interactivité, mais l'article lui-même (déjà chargé
// côté serveur) est reçu en prop, jamais re-fetché ici.
export function ArticleFeedback({ article }: { article: Article }) {
  const [etat, setEtat] = useState<Etat>("initial");
  const [utile, setUtile] = useState<boolean | null>(null);
  const [commentaire, setCommentaire] = useState("");
  // Persiste au-delà de "formulaire_negatif" (contrairement à `etat`, qui
  // passe à "envoi" pendant l'appel réseau) — sert à garder le formulaire
  // négatif affiché (avec son indicateur d'envoi) au lieu de le démonter
  // dès le clic sur "Envoyer mon retour" (bug retour Bryan 23/09/2026 :
  // l'envoi en cours était invisible car `etat === "formulaire_negatif"`
  // devenait faux pendant l'envoi).
  const [modeNegatif, setModeNegatif] = useState(false);
  const commentaireRef = useRef<HTMLTextAreaElement>(null);
  const confirmationRef = useRef<HTMLParagraphElement>(null);

  // Anti-doublon session (retour Bryan 23/09/2026) — un feedback déjà
  // envoyé pour CET article dans ce navigateur ne réaffiche jamais les
  // boutons de vote. try/catch obligatoire (localStorage peut lever en
  // navigation privée Safari, piège déjà documenté du projet).
  useEffect(() => {
    try {
      const brut = localStorage.getItem(cleStockage(article));
      if (brut) {
        const sauvegarde = JSON.parse(brut) as { helpful: boolean };
        setUtile(sauvegarde.helpful);
        setEtat("envoye");
      }
    } catch {
      /* ignore */
    }
  }, [article]);

  useEffect(() => {
    if (etat === "formulaire_negatif") commentaireRef.current?.focus();
    if (etat === "envoye") confirmationRef.current?.focus();
  }, [etat]);

  async function envoyer(helpful: boolean, commentaireEnvoye?: string) {
    setEtat("envoi");
    try {
      const res = await fetch(`/api/help/articles/${article.id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          helpful,
          domaine: article.domaine,
          ...(commentaireEnvoye ? { comment: commentaireEnvoye } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.message ?? "Erreur serveur");

      setUtile(helpful);
      setEtat("envoye");
      try {
        localStorage.setItem(cleStockage(article), JSON.stringify({ helpful, submittedAt: new Date().toISOString() }));
      } catch {
        /* ignore */
      }
    } catch {
      setEtat("erreur");
    }
  }

  if (etat === "envoye") {
    return (
      <div className="hc-article-feedback">
        {utile ? (
          <div className="hc-article-feedback__confirmation-wrap">
            <span className="hc-article-feedback__confirmation-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.5 13.2c0-1.4.5-2.6 1.5-3.6l6-6c.9-.9 2.3-.9 3.1.1.8.9.7 2.3-.3 3.1L9.6 10h4.9c1.9 0 3.5 1.6 3.5 3.5v1.7c0 2.9-2.3 5.3-5.3 5.3H8.3c-3.2 0-5.8-2.6-5.8-5.8v-1.5Z" />
              </svg>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ transform: "scaleX(-1)", marginLeft: "-6px" }}>
                <path d="M2.5 13.2c0-1.4.5-2.6 1.5-3.6l6-6c.9-.9 2.3-.9 3.1.1.8.9.7 2.3-.3 3.1L9.6 10h4.9c1.9 0 3.5 1.6 3.5 3.5v1.7c0 2.9-2.3 5.3-5.3 5.3H8.3c-3.2 0-5.8-2.6-5.8-5.8v-1.5Z" />
              </svg>
            </span>
            <p
              ref={confirmationRef}
              tabIndex={-1}
              aria-live="polite"
              className="hc-article-feedback__confirmation hc-article-feedback__confirmation--positive"
            >
              Merci pour votre retour.
            </p>
          </div>
        ) : (
          <div className="hc-article-feedback__confirmation-wrap">
            <span className="hc-article-feedback__confirmation-icon hc-article-feedback__confirmation-icon--negative" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 2v11" />
                <path d="M12 2H5.5a2 2 0 0 0-2 1.6l-1.4 7A2 2 0 0 0 4 13h5.5l-1 5a2 2 0 0 0 2 2.4L12 16l3-3.5V2Z" />
              </svg>
            </span>
            <p
              ref={confirmationRef}
              tabIndex={-1}
              aria-live="polite"
              className="hc-article-feedback__confirmation hc-article-feedback__confirmation--negative"
            >
              Merci. Votre retour aidera l&apos;équipe Yelen à améliorer cet article.
            </p>
          </div>
        )}
        <Link href="/guide-prestataire" className="hc-article-feedback__autre">
          Voir un autre article
        </Link>
      </div>
    );
  }

  return (
    <div className="hc-article-feedback">
      <p className="hc-article-feedback__question">Cet article vous a-t-il aidé ?</p>

      {!modeNegatif && (
        <div className="hc-article-feedback__actions">
          <button
            type="button"
            className="hc-article-feedback__btn"
            disabled={etat === "envoi"}
            onClick={() => envoyer(true)}
          >
            {etat === "envoi" ? (
              <>
                <YelenLoader size={16} color="currentColor" />
                Envoi en cours…
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M7 22V11" />
                  <path d="M12 22h6.5a2 2 0 0 0 2-1.6l1.4-7A2 2 0 0 0 20 11h-5.5l1-5a2 2 0 0 0-2-2.4L12 8l-3 3.5V22Z" />
                </svg>
                Oui, il m&apos;a aidé
              </>
            )}
          </button>
          <button
            type="button"
            className="hc-article-feedback__btn"
            disabled={etat === "envoi"}
            onClick={() => { setModeNegatif(true); setEtat("formulaire_negatif"); }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 2v11" />
              <path d="M12 2H5.5a2 2 0 0 0-2 1.6l-1.4 7A2 2 0 0 0 4 13h5.5l-1 5a2 2 0 0 0 2 2.4L12 16l3-3.5V2Z" />
            </svg>
            Non, j&apos;ai encore besoin d&apos;aide
          </button>
        </div>
      )}

      {modeNegatif && (
        <div className="hc-article-feedback__form">
          <label htmlFor="hc-feedback-comment" className="hc-article-feedback__label">
            Merci. Qu&apos;est-ce qui manque ou n&apos;est pas clair ?
          </label>
          <textarea
            id="hc-feedback-comment"
            ref={commentaireRef}
            className="hc-article-feedback__textarea"
            rows={4}
            maxLength={COMMENTAIRE_MAX}
            value={commentaire}
            disabled={etat === "envoi"}
            onChange={(e) => setCommentaire(e.target.value)}
          />
          <p className="hc-article-feedback__hint">
            Ne partagez pas de mot de passe, de code de sécurité, de numéro
            de carte ou d&apos;autres informations sensibles.
          </p>
          <p className="hc-article-feedback__count">{commentaire.length} / {COMMENTAIRE_MAX}</p>

          <button
            type="button"
            className="hc-article-feedback__btn hc-article-feedback__btn--primary"
            disabled={etat === "envoi"}
            onClick={() => envoyer(false, commentaire.trim() || undefined)}
          >
            {etat === "envoi" ? (
              <>
                <YelenLoader size={16} color="currentColor" />
                Envoi en cours…
              </>
            ) : (
              "Envoyer mon retour"
            )}
          </button>

          <p className="hc-article-feedback__support">
            Besoin d&apos;aide avec votre situation ?{" "}
            <Link href="/contact">Contacter le support Yelen</Link>
          </p>
        </div>
      )}

      {etat === "erreur" && (
        <p role="alert" aria-live="polite" className="hc-article-feedback__erreur">
          Votre retour n&apos;a pas pu être envoyé. Vérifiez votre connexion et réessayez.
        </p>
      )}
    </div>
  );
}
