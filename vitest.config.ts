import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

// Config minimale (chantier Auth Security 28/08/2026, Lot 8) — premier
// usage de Vitest dans ce projet (présent en devDependency depuis un
// moment mais jamais configuré). Alias "@/*" aligné sur tsconfig.json,
// environnement Node par défaut (aucun test DOM pour l'instant, ce sont
// des tests unitaires de logique serveur).
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    include: ["**/*.test.ts"],
    // configDefaults.exclude couvre déjà node_modules/.git/dist/etc. — ne
    // jamais remplacer ce tableau par un tableau custom (piège Vitest :
    // `exclude` écrase les défauts au lieu de les compléter, ce qui a fait
    // tourner 65 tests de dépendances tierces au premier essai ici).
    exclude: [...configDefaults.exclude, "supabase/functions/**"],
  },
});
