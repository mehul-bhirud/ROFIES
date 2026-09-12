import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  environment: {
    ROFIES_ENVIRONMENT: "test",
    demoMode: false,
    supabaseConfigured: true
  }
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server", () => ({
  getServerEnvironment: () => mocks.environment
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient
}));

import {
  getCategories,
  getCatalogItemForEdit,
  getInventoryListItems,
  getStorageLocations
} from "@/lib/catalog/queries";

describe("catalog admin query loaders", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.environment.demoMode = false;
    mocks.environment.supabaseConfigured = true;
  });

  it("loads active categories ordered by name", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{ id: "00000000-0000-0000-0000-000000000201", name: "Controllers" }],
      error: null
    });
    const is = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ is }));
    const from = vi.fn(() => ({ select }));
    mocks.createSupabaseServerClient.mockResolvedValue({ from });

    const categories = await getCategories();

    expect(from).toHaveBeenCalledWith("categories");
    expect(categories).toEqual([{ id: "00000000-0000-0000-0000-000000000201", name: "Controllers" }]);
  });

  it("loads active storage locations with a readable label", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: "00000000-0000-0000-0000-000000000301",
          room: "Robotics Lab",
          cabinet: "Blue cabinet",
          shelf: "Shelf B",
          bin: "Bin 4"
        }
      ],
      error: null
    });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    mocks.createSupabaseServerClient.mockResolvedValue({ from });

    const locations = await getStorageLocations();

    expect(from).toHaveBeenCalledWith("storage_locations");
    expect(locations).toEqual([
      { id: "00000000-0000-0000-0000-000000000301", label: "Robotics Lab / Blue cabinet / Shelf B / Bin 4" }
    ]);
  });

  it("loads the staff inventory list via the inventory_list RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: "00000000-0000-0000-0000-000000000101",
          name: "Arduino Mega 2560",
          category_name: "Controllers",
          tracking_mode: "pooled_reusable",
          archived_at: null,
          usable_on_hand: 10,
          repair_quantity: 0
        }
      ],
      error: null
    });
    const schema = vi.fn(() => ({ rpc }));
    mocks.createSupabaseServerClient.mockResolvedValue({ schema });

    const items = await getInventoryListItems();

    expect(schema).toHaveBeenCalledWith("api");
    expect(rpc).toHaveBeenCalledWith("inventory_list");
    expect(items[0]).toMatchObject({ id: "00000000-0000-0000-0000-000000000101", usableOnHand: 10 });
  });

  it("loads a single catalog item detail via the catalog_item_detail RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        id: "00000000-0000-0000-0000-000000000101",
        category_id: "00000000-0000-0000-0000-000000000201",
        name: "Arduino Mega 2560",
        description: "High-I/O development board",
        tracking_mode: "pooled_reusable",
        public_remarks: "",
        internal_remarks: "",
        default_loan_days: 7,
        maximum_loan_days: 21,
        member_quantity_limit: 3,
        pickup_window_hours: 24,
        waitlist_enabled: true,
        counter_issue_enabled: false,
        low_stock_threshold: 3,
        acquisition_date: null,
        supplier: null,
        warranty_until: null,
        replacement_cost: null,
        archived_at: null,
        tags: ["Embedded", "5 V"]
      },
      error: null
    });
    const schema = vi.fn(() => ({ rpc }));
    mocks.createSupabaseServerClient.mockResolvedValue({ schema });

    const item = await getCatalogItemForEdit("00000000-0000-0000-0000-000000000101");

    expect(rpc).toHaveBeenCalledWith("catalog_item_detail", {
      catalog_item_id: "00000000-0000-0000-0000-000000000101"
    });
    expect(item).toMatchObject({ name: "Arduino Mega 2560", tags: ["Embedded", "5 V"] });
  });
});
