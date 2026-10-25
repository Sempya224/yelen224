import { NextResponse } from "next/server";

// Réponses d'erreur API : message français + code stable. Le détail technique
// (message Postgres/PostgREST, stack) ne part JAMAIS au client — il reste dans
// les logs serveur (Lot 1a, API Services).

export const MESSAGE_ERREUR_SERVEUR = "Une erreur est survenue. Réessayez dans un instant.";

export function reponseErreur(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: message, code }, { status });
}

export function reponseErreurServeur(contexte: string, err: { message?: string; code?: string } | null | undefined): NextResponse {
  console.error(`[${contexte}]`, err?.code ?? "", err?.message ?? "");
  return reponseErreur("ERREUR_SERVEUR", MESSAGE_ERREUR_SERVEUR, 500);
}
