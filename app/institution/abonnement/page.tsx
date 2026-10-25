import { redirect } from "next/navigation";

// Ancienne page d'abonnement (statique, sans contexte d'établissement) :
// remplacée par l'onglet « Forfait Yelen » du dashboard. Aucun lien n'y mène
// encore ; cette redirection couvre les favoris existants.
export default function InstitutionAbonnementPage() {
  redirect("/institution/connexion");
}
