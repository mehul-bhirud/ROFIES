import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerEnvironment } from "@/lib/env/server";
import { isTrustedMutationOrigin } from "@/lib/safety/origin";
import { normalizeEquipmentPhoto } from "@/lib/safety/images";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/telemetry";
import { postgresUuidSchema } from "@/lib/validation/uuid";

const fieldsSchema = z.object({
  catalogId: postgresUuidSchema,
  caption: z.string().trim().max(300)
});

export async function POST(request: NextRequest) {
  const referenceId = randomUUID();
  const environment = getServerEnvironment();
  if (!isTrustedMutationOrigin(request.headers.get("origin"), environment.ROFIES_APP_ORIGIN))
    return NextResponse.json({ message: "Resource unavailable", referenceId }, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 9 * 1024 * 1024)
    return NextResponse.json({ message: "Photo is too large", referenceId }, { status: 413 });
  if (environment.maintenanceMode)
    return NextResponse.json(
      { message: "Protected operations are paused", referenceId },
      { status: 503 }
    );
  if (environment.demoMode) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ message: "Invalid upload", referenceId }, { status: 400 });
    }
    const parsed = fieldsSchema.safeParse({
      catalogId: form.get("catalogId"),
      caption: form.get("caption") ?? ""
    });
    const file = form.get("photo");
    if (!parsed.success || !(file instanceof File))
      return NextResponse.json(
        { message: "Choose an equipment item and image", referenceId },
        { status: 422 }
      );
    try {
      await normalizeEquipmentPhoto(Buffer.from(await file.arrayBuffer()));
    } catch {
      return NextResponse.json(
        { message: "Use a single-frame JPEG, PNG, WebP, or AVIF image up to 8 MB", referenceId },
        { status: 422 }
      );
    }
    return NextResponse.json(
      {
        status: "committed",
        referenceId,
        demo: true,
        result: { photo_id: referenceId, catalog_id: parsed.data.catalogId }
      },
      { status: 201 }
    );
  }
  const client = await createSupabaseServerClient();
  const service = createSupabaseServiceClient();
  if (!client || !service)
    return NextResponse.json({ message: "Upload unavailable", referenceId }, { status: 503 });
  const { data: user } = await client.auth.getUser();
  if (!user.user)
    return NextResponse.json({ message: "Resource unavailable", referenceId }, { status: 404 });
  const [{ data: authorized }, { data: rateAllowed }] = await Promise.all([
    client.schema("api").rpc("has_capability", { required_capability: "inventory:manage" }),
    client
      .schema("api")
      .rpc("consume_rate_limit", { command: "equipment_photo", maximum: 10, window_seconds: 60 })
  ]);
  if (!authorized)
    return NextResponse.json({ message: "Resource unavailable", referenceId }, { status: 404 });
  if (!rateAllowed)
    return NextResponse.json(
      { message: "Too many uploads. Wait and retry.", referenceId },
      { status: 429 }
    );
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ message: "Invalid upload", referenceId }, { status: 400 });
  }
  const parsed = fieldsSchema.safeParse({
    catalogId: form.get("catalogId"),
    caption: form.get("caption") ?? ""
  });
  const file = form.get("photo");
  if (!parsed.success || !(file instanceof File))
    return NextResponse.json(
      { message: "Choose an equipment item and image", referenceId },
      { status: 422 }
    );
  let normalized: Awaited<ReturnType<typeof normalizeEquipmentPhoto>>;
  try {
    normalized = await normalizeEquipmentPhoto(Buffer.from(await file.arrayBuffer()));
  } catch {
    logEvent("photo.failed", {
      referenceId,
      actorId: user.user.id,
      outcome: "validation_rejected"
    });
    return NextResponse.json(
      { message: "Use a single-frame JPEG, PNG, WebP, or AVIF image up to 8 MB", referenceId },
      { status: 422 }
    );
  }
  const objectName = `${parsed.data.catalogId}/${randomUUID()}.webp`;
  const { error: uploadError } = await service.storage
    .from("equipment-photos")
    .upload(objectName, normalized.data, {
      contentType: normalized.contentType,
      upsert: false,
      metadata: { rofies_processed: "true" }
    });
  if (uploadError)
    return NextResponse.json({ message: "Upload unavailable", referenceId }, { status: 503 });
  const { data, error } = await client.schema("api").rpc("register_item_photo", {
    catalog_id: parsed.data.catalogId,
    object_name: objectName,
    caption: parsed.data.caption,
    width: normalized.width,
    height: normalized.height
  });
  if (error) {
    await service.storage.from("equipment-photos").remove([objectName]);
    logEvent("photo.failed", { referenceId, actorId: user.user.id, outcome: error.code });
    return NextResponse.json(
      { message: "Photo could not be registered", referenceId },
      { status: 400 }
    );
  }
  logEvent("photo.committed", {
    referenceId,
    actorId: user.user.id,
    outcome: "committed",
    photoId: data?.photo_id
  });
  return NextResponse.json({ status: "committed", referenceId, result: data }, { status: 201 });
}
