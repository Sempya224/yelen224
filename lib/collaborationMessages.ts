import { createClient } from "@supabase/supabase-js";

// Module Collaboration — helpers partagés entre plusieurs routes (déplacés
// hors de app/api/.../route.ts le 16/09/2026 : Next.js interdit tout export
// nommé additionnel dans un fichier route.ts, au même titre que page.tsx —
// TS2344 détecté par tsc, invisible tant qu'aucun typegen Next n'avait
// tourné sur ce fichier précis).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type NomAuteurRel = { prenom: string; nom: string } | { prenom: string; nom: string }[] | null;
export type MessageBrut = { id: string; auteur_membre_id: string | null; contenu: string | null; modifie_le: string | null; supprime_le: string | null; cree_le: string; fichier_path?: string | null; fichier_nom?: string | null; fichier_taille?: number | null; fichier_type?: string | null; institution_membres?: NomAuteurRel };

const TYPES_REACTION = ["pouce", "coeur", "valide", "attention"] as const;

// Extraction déterministe des @mentions — un message mentionne un membre
// s'il contient littéralement "@Prénom Nom" (format inséré par
// l'autocomplete de la composeuse, jamais deviné/interprété).
export function extraireMentions(contenu: string, participants: { membre_id: string; prenom: string; nom: string }[]): string[] {
  const trouves = new Set<string>();
  for (const p of participants) {
    if (contenu.includes(`@${p.prenom} ${p.nom}`)) trouves.add(p.membre_id);
  }
  return [...trouves];
}

// Formatte des messages bruts : signe les fichiers joints (URL courte, 60s,
// même politique que les autres buckets privés du projet), agrège les
// réactions par type + "j'ai réagi" pour l'appelant, et résout le nom de
// l'auteur par jointure directe (jamais via la liste des participants
// ACTIFS — un membre qui a quitté/été retiré du groupe depuis reste
// l'auteur légitime de ses anciens messages, revue critique 16/09/2026,
// 2e passage). Partagé entre le fil racine et le panneau Discussion.
export async function formaterMessagesAvecFichiersEtReactions(messages: MessageBrut[], appelantId: string) {
  const messageIds = messages.map(m => m.id);
  const [{ data: reactions }] = await Promise.all([
    messageIds.length ? sb.from("collab_message_reactions").select("message_id,membre_id,type_reaction").in("message_id", messageIds) : Promise.resolve({ data: [] as { message_id: string; membre_id: string; type_reaction: string }[] }),
  ]);

  const reactionsParMessage = new Map<string, { type_reaction: string; count: number; par_moi: boolean }[]>();
  for (const r of reactions ?? []) {
    const liste = reactionsParMessage.get(r.message_id) ?? [];
    let entree = liste.find(e => e.type_reaction === r.type_reaction);
    if (!entree) { entree = { type_reaction: r.type_reaction, count: 0, par_moi: false }; liste.push(entree); }
    entree.count += 1;
    if (r.membre_id === appelantId) entree.par_moi = true;
    reactionsParMessage.set(r.message_id, liste);
  }

  return Promise.all(messages.map(async m => {
    let fichier: { nom: string; taille: number; type: string; url: string | null } | null = null;
    if (m.fichier_path && !m.supprime_le) {
      const { data: signe } = await sb.storage.from("collaboration-fichiers").createSignedUrl(m.fichier_path, 60);
      fichier = { nom: m.fichier_nom ?? "Fichier", taille: m.fichier_taille ?? 0, type: m.fichier_type ?? "", url: signe?.signedUrl ?? null };
    }
    const relAuteur = Array.isArray(m.institution_membres) ? m.institution_membres[0] : m.institution_membres;
    const auteurNom = m.auteur_membre_id === null ? "Ancien membre" : relAuteur ? `${relAuteur.prenom} ${relAuteur.nom}` : null;
    return {
      id: m.id,
      auteur_membre_id: m.auteur_membre_id,
      auteur_nom: auteurNom,
      // Revue critique 16/09/2026 : auteur_membre_id devient NULL quand ce
      // membre a été supprimé de l'équipe depuis (voir migration
      // 20260916000009, ON DELETE SET NULL — le message n'est plus effacé
      // avec lui). "Ancien membre" plutôt qu'un vide silencieux.
      auteur_supprime: m.auteur_membre_id === null,
      de_moi: m.auteur_membre_id !== null && m.auteur_membre_id === appelantId,
      contenu: m.supprime_le ? null : m.contenu,
      supprime: !!m.supprime_le,
      modifie: !!m.modifie_le,
      cree_le: m.cree_le,
      fichier,
      reactions: (reactionsParMessage.get(m.id) ?? []).sort((a, b) => TYPES_REACTION.indexOf(a.type_reaction as typeof TYPES_REACTION[number]) - TYPES_REACTION.indexOf(b.type_reaction as typeof TYPES_REACTION[number])),
    };
  }));
}
