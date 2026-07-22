import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Variables d’environnement manquantes : NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY doivent être définies.",
  );
}

export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey,
);

/**
 * Client Supabase scopé à une requête, authentifié avec le JWT d'une
 * session citoyen déjà établie côté navigateur. Nécessaire dans les Server
 * Actions ("use server") : elles s'exécutent côté serveur Next.js et n'ont
 * pas accès à la session tenue dans le localStorage du navigateur — le
 * singleton `supabase` ci-dessus y est donc toujours non-authentifié.
 */
export function createAuthedSupabaseClient(accessToken: string): SupabaseClient {
  return createClient(supabaseUrl!, supabaseAnonKey!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
