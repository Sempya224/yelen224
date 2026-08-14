// Lookup par chemin pointé ("legal.mentions.title" -> valeur) dans un
// objet de messages JSON. Partagé entre i18n/request.ts (fallback
// serveur) et components/IntlClientProvider.tsx (fallback client) pour
// ne pas dupliquer la logique de repli vers le français.
export function readByPath(messages: unknown, namespace: string | undefined, key: string): unknown {
  const path = [namespace, key].filter(Boolean).join(".");
  return path.split(".").reduce<unknown>((acc, segment) => {
    if (acc && typeof acc === "object" && segment in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[segment];
    }
    return undefined;
  }, messages);
}
