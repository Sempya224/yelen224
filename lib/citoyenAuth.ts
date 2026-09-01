import { createClient, type User } from "@supabase/supabase-js";

// Point d'entrée unique pour vérifier un token de session citoyen
// (Supabase Auth) — remplace la vérification dupliquée indépendamment
// dans ~44 routes app/api/citoyen/** (GAP-08-01, voir
// docs/security/YELEN_SECURITY_GAP_ANALYSIS.md). Ne change aucun
// comportement externe : chaque route garde son propre message
// d'erreur et sa propre méthode d'extraction du token (header, query,
// body ou form-data) — seul l'appel Supabase et son évaluation
// error/user sont désormais partagés.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function verifierCitoyenToken(accessToken: string | null | undefined): Promise<User | null> {
  if (!accessToken) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !user) return null;
  return user;
}
