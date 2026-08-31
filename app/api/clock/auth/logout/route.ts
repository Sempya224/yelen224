import { NextResponse } from "next/server";

// Miroir de app/api/institution/auth/logout/route.ts, sans révocation de
// "remember token" — ce concept n'existe pas pour les employés en V1 (pas
// dans les 8 tables du schéma Clock In Shift, pas de kiosque "appareil de
// confiance" prévu avant une V2).
export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete("yelen224_employee_session");
  return response;
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
