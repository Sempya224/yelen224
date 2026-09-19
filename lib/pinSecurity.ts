// Codes trop faibles pour servir de verrou réel — rejetés même s'ils
// respectent le format attendu (nombre de chiffres). Répétitions et suites
// triviales uniquement ; on ne prétend pas couvrir tous les cas, juste les
// plus évidents. Règle métier partagée par tous les PIN Yelen (institution
// "Accès rapide" et membres "Équipe & Accès") — un seul point de vérité,
// jamais un calcul local concurrent (retour Bryan 13/09/2026 : un PIN membre
// "123456" avait été accepté sans rejet, cette règle n'existait jusque-là
// que sur le PIN institution).
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true; // 0000, 1111, 222222...
  const ascending = pin.split("").every((d, i) => i === 0 || Number(d) === Number(pin[i - 1]) + 1);
  const descending = pin.split("").every((d, i) => i === 0 || Number(d) === Number(pin[i - 1]) - 1);
  return ascending || descending; // 1234, 4321, 123456...
}

export const PIN_TROP_SIMPLE_MESSAGE = "Ce code est trop simple (chiffres répétés ou suite logique). Choisissez-en un autre.";
