import { DecouverteYelenInner } from "./DecouverteYelenInner";

// Porte d'entrée professionnelle Yelen (Lot 03-A) — écran de découverte et
// de valeur, distinct du formulaire d'inscription. Le contenu réel vit dans
// DecouverteYelenInner.tsx (piège App Router déjà documenté dans le projet :
// page.tsx n'autorise aucun export nommé au-delà de default).
export default function DecouvertePage() {
  return <DecouverteYelenInner/>;
}
