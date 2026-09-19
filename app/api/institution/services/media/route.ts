import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { validateUpload } from "@/lib/uploadSecurity";

// Upload média chambre — photo OU vidéo (chantier Services Hôtel V2,
// retour Bryan 20/08/2026 : "jusqu'à 5 images et une vidéo max 60s").
// Remplace api/institution/services/photo (1 seule photo). Chemin unique
// par upload (jamais `${institutionId}.${ext}` — une chambre a jusqu'à 5
// photos + 1 vidéo, aucune ne doit écraser une autre). Même bucket public
// "avatars" déjà utilisé pour logo/bannière/photo de chambre — pas de
// nouveau bucket à faire créer par Bryan.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
// 60s annoncé par le client (lecture de <video>.duration avant upload) —
// marge de 2s tolérée pour l'arrondi navigateur. Aucun outil de probing
// vidéo serveur (ffprobe) n'existe dans ce projet : cette valeur est
// déclarative, pas une garantie cryptographique (voir commentaire de la
// migration 20260821000010, colonne video_duree_secondes).
const MAX_VIDEO_DUREE_SECONDES = 62;

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "services.write")) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  const kind = form.get("kind");
  if (kind !== "photo" && kind !== "video") return NextResponse.json({ error: "Type de média invalide" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Fichier requis" }, { status: 400 });

  if (kind === "video") {
    const dureeRaw = form.get("duree_secondes");
    const duree = typeof dureeRaw === "string" ? Number(dureeRaw) : NaN;
    if (!Number.isFinite(duree) || duree <= 0) return NextResponse.json({ error: "Durée de la vidéo manquante ou invalide" }, { status: 400 });
    if (duree > MAX_VIDEO_DUREE_SECONDES) return NextResponse.json({ error: "La vidéo dépasse 60 secondes" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const maxSize = kind === "video" ? MAX_VIDEO_SIZE : MAX_PHOTO_SIZE;
  const verif = await validateUpload(buffer, kind === "video" ? "PUBLIC_VIDEO" : "PUBLIC_IMAGE", maxSize, file.name);
  if (!verif.valid) return NextResponse.json({ error: verif.reason }, { status: 400 });
  const path = `chambres/${membre.institutionId}-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${verif.extension}`;

  const { error: upErr } = await sb.storage.from("avatars").upload(path, buffer, {
    upsert: true,
    contentType: verif.detectedType,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data } = sb.storage.from("avatars").getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
