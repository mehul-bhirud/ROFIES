import "server-only";
import { cache } from "react";
import { getServerEnvironment } from "@/lib/env/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { demoCatalog, demoCategories, demoStorageLocations, demoInventoryListItems, demoCatalogItemDetail } from "@/lib/demo-data";
import type { CatalogItemView, Category, StorageLocation, InventoryListItem, CatalogItemDetail } from "@/lib/catalog/types";

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

export const getCategories = cache(async (): Promise<readonly Category[]> => {
  const env = getServerEnvironment();
  if (env.demoMode || !env.supabaseConfigured) return demoCategories;
  const client = await createSupabaseServerClient();
  if (!client) return [];
  const { data, error } = await client
    .from("categories")
    .select("id, name")
    .is("archived_at", null)
    .order("name");
  if (error) throw new Error(`Category query failed: ${error.code}`);
  return (data ?? []).map((row) => ({ id: row.id as string, name: row.name as string }));
});

export const getStorageLocations = cache(async (): Promise<readonly StorageLocation[]> => {
  const env = getServerEnvironment();
  if (env.demoMode || !env.supabaseConfigured) return demoStorageLocations;
  const client = await createSupabaseServerClient();
  if (!client) return [];
  const { data, error } = await client
    .from("storage_locations")
    .select("id, room, cabinet, shelf, bin")
    .eq("active", true)
    .order("room");
  if (error) throw new Error(`Storage location query failed: ${error.code}`);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    label: [row.room, row.cabinet, row.shelf, row.bin].filter(Boolean).join(" / ")
  }));
});

export const getInventoryListItems = cache(async (): Promise<readonly InventoryListItem[]> => {
  const env = getServerEnvironment();
  if (env.demoMode || !env.supabaseConfigured) return demoInventoryListItems;
  const client = await createSupabaseServerClient();
  if (!client) return [];
  const { data, error } = await client.schema("api").rpc("inventory_list");
  if (error) throw new Error(`Inventory list query failed: ${error.code}`);
  return (data as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    categoryName: row.category_name as string,
    trackingMode: row.tracking_mode as InventoryListItem["trackingMode"],
    archivedAt: (row.archived_at as string | null) ?? null,
    usableOnHand: Number(row.usable_on_hand),
    repairQuantity: Number(row.repair_quantity)
  }));
});

export const getCatalogItemForEdit = cache(async (id: string): Promise<CatalogItemDetail | null> => {
  const env = getServerEnvironment();
  if (env.demoMode || !env.supabaseConfigured) return demoCatalogItemDetail[id] ?? null;
  const client = await createSupabaseServerClient();
  if (!client) return null;
  const { data, error } = await client.schema("api").rpc("catalog_item_detail", { catalog_item_id: id });
  if (error) throw new Error(`Catalog item detail query failed: ${error.code}`);
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: row.id as string,
    categoryId: row.category_id as string,
    name: row.name as string,
    description: row.description as string,
    trackingMode: row.tracking_mode as CatalogItemDetail["trackingMode"],
    publicRemarks: row.public_remarks as string,
    internalRemarks: row.internal_remarks as string,
    defaultLoanDays: (row.default_loan_days as number | null) ?? null,
    maximumLoanDays: (row.maximum_loan_days as number | null) ?? null,
    memberQuantityLimit: (row.member_quantity_limit as number | null) ?? null,
    pickupWindowHours: (row.pickup_window_hours as number | null) ?? null,
    waitlistEnabled: row.waitlist_enabled as boolean,
    counterIssueEnabled: row.counter_issue_enabled as boolean,
    lowStockThreshold: (row.low_stock_threshold as number | null) ?? null,
    acquisitionDate: (row.acquisition_date as string | null) ?? null,
    supplier: (row.supplier as string | null) ?? null,
    warrantyUntil: (row.warranty_until as string | null) ?? null,
    replacementCost: (row.replacement_cost as number | null) ?? null,
    archivedAt: (row.archived_at as string | null) ?? null,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : []
  };
});
