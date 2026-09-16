import bcrypt from "bcryptjs";
import crypto from "crypto";

// Source unique de génération des codes de secours 2FA — extrait de
// app/api/institution/securite/totp/verify/route.ts (16/09/2026) pour être
// réutilisé par le régénérateur (backup-codes/regenerate). 8 codes en
// clair retournés une seule fois, seuls leurs hash bcrypt sont conservés
// (institution_membres.totp_backup_codes).
function genererCodeSecours(): string {
  const hex = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

export async function genererCodesSecours(): Promise<{ clair: string[]; hashes: string[] }> {
  const clair = Array.from({ length: 8 }, genererCodeSecours);
  const hashes = await Promise.all(clair.map(c => bcrypt.hash(c, 10)));
  return { clair, hashes };
}
