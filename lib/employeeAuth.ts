import { NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Vérifie le cookie de session JWT employé (yelen224_employee_session,
// signé dans app/api/clock/auth/login/route.ts). Miroir de
// lib/institutionAuth.ts, secret et issuer/audience distincts —
// l'authentification employé (portail Clock In Shift, Identifiant+PIN
// contre employee_credentials) est une population et une frontière de
// sécurité séparées de institution_membres (dashboard Yelen).
const JWT_SECRET = new TextEncoder().encode(process.env.EMPLOYEE_JWT_SECRET!);

export type EmployeeRole = "admin" | "manager" | "employe";

export type AuthenticatedEmployee = {
  institutionId: string;
  employeeId: string;
  role: EmployeeRole;
};

function isEmployeeRole(value: unknown): value is EmployeeRole {
  return value === "admin" || value === "manager" || value === "employe";
}

export async function getAuthenticatedEmployee(request: NextRequest): Promise<AuthenticatedEmployee | null> {
  const token = request.cookies.get("yelen224_employee_session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: "yelen224-clock-in-shift",
      audience: "yelen224-clock-in-shift-portal",
    });
    const institutionId = payload.institutionId;
    const employeeId = payload.employeeId;
    const role = payload.role;
    if (typeof institutionId !== "string" || typeof employeeId !== "string") return null;
    if (!isEmployeeRole(role)) return null;
    return { institutionId, employeeId, role };
  } catch {
    return null;
  }
}
