// Assistant de téléchargement des exports serveur (24/10/2026), côté NAVIGATEUR
// (aucun import Node). Remplace les copies d'export CSV générées dans le navigateur :
// le fichier est produit, enregistré et signé par le serveur ; ici on envoie la
// sélection affichée, on télécharge sous le nom choisi par le serveur (référence
// incluse) et on renvoie un message prêt à afficher.
export type ResultatTelechargement = { ok: boolean; texte: string };

export function messageExportGenere(reference: string | null, empreinte: string | null): string {
  return `Export ${reference ?? ""} généré${empreinte ? ` — empreinte SHA-256 : ${empreinte.slice(0, 16)}…` : ""}`.replace("  ", " ");
}

// POST JSON puis téléchargement du fichier renvoyé. Ne lève jamais : toute erreur
// devient un message explicite.
export async function telechargerExportServeur(url: string, corps: unknown, nomDeRepli: string): Promise<ResultatTelechargement> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
    if (!res.ok) {
      const j: unknown = await res.json().catch(() => null);
      const message = j && typeof j === "object" && typeof (j as { error?: unknown }).error === "string" ? (j as { error: string }).error : null;
      return { ok: false, texte: message ?? "L'export a échoué. Réessayez." };
    }
    const filename = (res.headers.get("Content-Disposition") || "").match(/filename="([^"]+)"/)?.[1] || nomDeRepli;
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(objUrl);
    return { ok: true, texte: messageExportGenere(res.headers.get("X-Export-Reference"), res.headers.get("X-Empreinte-Sha256")) };
  } catch {
    return { ok: false, texte: "Erreur réseau lors de l'export. Réessayez." };
  }
}
