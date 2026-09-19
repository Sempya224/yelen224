// Stub requis par Next.js pour matcher /{slug}/{id}/{screen} — tout le
// rendu réel du dashboard institution vit dans le layout parent
// (app/[slug]/[id]/layout.tsx), qui lit le segment [screen] lui-même via
// useParams() et ne se remonte jamais entre deux écrans (voir le
// commentaire du layout pour le détail).
export default function InstitutionScreenPage() {
  return null;
}
