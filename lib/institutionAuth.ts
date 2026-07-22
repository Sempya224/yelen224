import { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { isMembreRole, type MembreRole } from "@/lib/institutionPermissions";

// Vérifie le cookie de session JWT institution (yelen224_institution_session,
// signé dans verify-otp / pin/verify / webauthn/auth-verify). Auparavant
// dupliqué localement dans pin/set/route.ts uniquement — la plupart des
// routes app/api/institution/*/route.ts (rdv-jour, profile) faisaient
// confiance à un institution_id de query string sans aucune vérification.
const JWT_SECRET = new TextEncoder().encode(process.env.INSTITUTION_JWT_SECRET!);

export async function getAuthenticatedInstitutionId(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get("yelen224_institution_session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: "yelen224-institution",
      audience: "yelen224-institution-dashboard",
    });
    return typeof payload.institutionId === "string" ? payload.institutionId : null;
  } catch {
    return null;
  }
}

export type { MembreRole };

export type AuthenticatedMembre = {
  institutionId: string;
  membreId: string;
  role: MembreRole;
};

// Lit membreId/role du même cookie/JWT que getAuthenticatedInstitutionId —
// aucun nouveau cookie. Les sessions signées avant l'ajout de ces claims
// (fondation multi-comptes, migration 20260714000001) n'ont pas membreId :
// retourne null dans ce cas, la session expire naturellement sous 8h.
export async function getAuthenticatedMembre(request: NextRequest): Promise<AuthenticatedMembre | null> {
  const token = request.cookies.get("yelen224_institution_session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: "yelen224-institution",
      audience: "yelen224-institution-dashboard",
    });
    const institutionId = payload.institutionId;
    const membreId = payload.membreId;
    const role = payload.role;
    if (typeof institutionId !== "string" || typeof membreId !== "string" || typeof role !== "string") return null;
    if (!isMembreRole(role)) return null;
    return { institutionId, membreId, role };
  } catch {
    return null;
  }
}
