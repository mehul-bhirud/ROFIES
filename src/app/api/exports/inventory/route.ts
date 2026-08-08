import { NextResponse } from "next/server";
import { toCsv } from "@/lib/safety/csv";
import { getServerEnvironment } from "@/lib/env/server";
import { demoCatalog } from "@/lib/demo-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const env = getServerEnvironment();
  let rows: readonly (readonly string[])[];
  if (env.demoMode) {
    rows = [
      ["Name", "Tracking mode", "Usable on hand", "Repair quantity"],
      ...demoCatalog.map((item) => [
        item.name,
        item.trackingMode,
        String(item.usableOnHand),
        String(item.repairQuantity)
      ])
    ];
  } else {
    const client = await createSupabaseServerClient();
    if (!client) return NextResponse.json({ message: "Resource unavailable" }, { status: 503 });
    const { data: user } = await client.auth.getUser();
    if (!user.user) return NextResponse.json({ message: "Resource unavailable" }, { status: 404 });
    const { data: authorized } = await client
      .schema("api")
      .rpc("has_capability", { required_capability: "reports:export" });
    if (!authorized) return NextResponse.json({ message: "Resource unavailable" }, { status: 404 });
    const { data, error } = await client
      .schema("api")
      .rpc("inventory_export", { result_limit: 2000 });
    if (error) return NextResponse.json({ message: "Export unavailable" }, { status: 503 });
    rows = [
      ["Name", "Tracking mode", "Usable on hand", "Repair quantity"],
      ...data.map((item: Record<string, unknown>) => [
        String(item.name),
        String(item.tracking_mode),
        String(item.usable_on_hand),
        String(item.repair_quantity)
      ])
    ];
  }
  return new NextResponse(`\uFEFF${toCsv(rows)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="rofies-inventory.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
