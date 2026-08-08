import "server-only";
import { cache } from "react";
import { getServerEnvironment } from "@/lib/env/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { demoCatalog } from "@/lib/demo-data";
import type { CatalogItemView } from "@/lib/catalog/types";

const seededPhotos: Readonly<Record<string, NonNullable<CatalogItemView["photo"]>>> = {
  "00000000-0000-0000-0000-000000000101": {
    src: "/equipment/arduino-mega.webp",
    alt: "Blue microcontroller development board on a technical workbench"
  },
  "00000000-0000-0000-0000-000000000103": {
    src: "/equipment/edge-ai-kit.webp",
    alt: "Compact edge-AI development kit with heatsink and power supply"
  },
  "00000000-0000-0000-0000-000000000104": {
    src: "/equipment/soldering-station.webp",
    alt: "Temperature-controlled soldering station with iron and safety stand"
  },
  "00000000-0000-0000-0000-000000000108": {
    src: "/equipment/logic-analyzer.webp",
    alt: "Compact USB logic analyzer with color-coded test leads"
  }
};

export const getCatalog = cache(
  async (query = "", rangeStart = "", rangeEnd = ""): Promise<readonly CatalogItemView[]> => {
    const env = getServerEnvironment();
    if (env.demoMode || !env.supabaseConfigured) {
      const normalized = query.trim().toLowerCase();
      return demoCatalog.filter(
        (item) =>
          !normalized ||
          `${item.name} ${item.description} ${item.tags.join(" ")} ${Object.values(item.specifications).join(" ")}`
            .toLowerCase()
            .includes(normalized)
      );
    }
    const client = await createSupabaseServerClient();
    if (!client) return [];
    const hasRange = Boolean(rangeStart && rangeEnd);
    const [{ data, error }, { data: photos, error: photoError }] = await Promise.all([
      client.schema("api").rpc("search_catalog", {
        search_query: query,
        range_start: hasRange ? rangeStart : undefined,
        range_end: hasRange ? rangeEnd : undefined,
        result_limit: 100,
        result_offset: 0
      }),
      client.schema("api").rpc("catalog_photos")
    ]);
    if (error) throw new Error(`Catalog query failed: ${error.code}`);
    if (photoError) throw new Error(`Catalog photo query failed: ${photoError.code}`);
    const photoByItem = new Map(
      (photos as Record<string, unknown>[]).map((photo) => [
        String(photo.catalog_item_id),
        {
          src: `/api/photos/${String(photo.photo_id)}`,
          alt: String(photo.caption || "Equipment catalog photograph")
        }
      ])
    );
    return (data as Record<string, unknown>[]).map((item) => ({
      id: item.id as string,
      name: item.name as string,
      description: item.description as string,
      categoryName: item.category_name as string,
      trackingMode: item.tracking_mode as CatalogItemView["trackingMode"],
      usableOnHand: Number(hasRange ? item.available_quantity : item.usable_on_hand),
      repairQuantity: Number(item.repair_quantity),
      expectedOn: item.expected_on
        ? new Intl.DateTimeFormat("en-IN", {
            day: "numeric",
            month: "short",
            timeZone: "Asia/Kolkata"
          }).format(new Date(String(item.expected_on)))
        : null,
      tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
      publicRemarks: item.public_remarks as string,
      specifications:
        typeof item.specifications === "object" && item.specifications !== null
          ? Object.fromEntries(
              Object.entries(item.specifications).map(([key, value]) => [key, String(value)])
            )
          : {},
      illustration: "controller",
      photo: photoByItem.get(item.id as string) ?? seededPhotos[item.id as string] ?? null,
      availabilityLabel: hasRange ? "available for dates" : "available now"
    }));
  }
);

export const getCatalogItem = cache(
  async (id: string) => (await getCatalog()).find((item) => item.id === id) ?? null
);
