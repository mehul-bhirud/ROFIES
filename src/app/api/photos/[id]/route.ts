import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { postgresUuidSchema } from "@/lib/validation/uuid";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const parsed = postgresUuidSchema.safeParse((await context.params).id);
  if (!parsed.success)
    return NextResponse.json({ message: "Resource unavailable" }, { status: 404 });
  const client = await createSupabaseServerClient();
  const service = createSupabaseServiceClient();
  if (!client || !service)
    return NextResponse.json({ message: "Resource unavailable" }, { status: 404 });
  const { data: user } = await client.auth.getUser();
  if (!user.user) return NextResponse.json({ message: "Resource unavailable" }, { status: 404 });
  const { data, error } = await client
    .schema("api")
    .rpc("catalog_photo_object", { photo_id: parsed.data });
  const record = Array.isArray(data) ? data[0] : null;
  if (error || !record?.object_name)
    return NextResponse.json({ message: "Resource unavailable" }, { status: 404 });
  const { data: file, error: downloadError } = await service.storage
    .from("equipment-photos")
    .download(String(record.object_name));
  if (downloadError || !file)
    return NextResponse.json({ message: "Resource unavailable" }, { status: 404 });
  return new NextResponse(await file.arrayBuffer(), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
