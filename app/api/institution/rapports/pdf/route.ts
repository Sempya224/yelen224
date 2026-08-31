import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { calculerRapportExecutif } from "@/lib/rapportsAggregation";
import { genererRapportPdf } from "@/lib/rapportsPdf";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "rapports") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const { data: inst } = await sb.from("institutions").select("name").eq("id", membre.institutionId).maybeSingle();
  const rapport = await calculerRapportExecutif(membre.institutionId);
  const buffer = await genererRapportPdf(rapport, inst?.name ?? "Institution");

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="rapport-executif-${new Date().toISOString().slice(0, 10)}.pdf"`,
    },
  });
}
