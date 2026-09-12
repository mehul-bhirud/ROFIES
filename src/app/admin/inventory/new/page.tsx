import { AppShell } from "@/components/layout/app-shell";
import { CatalogItemForm } from "@/components/inventory/catalog-item-form";
import { requireAnyCapability } from "@/lib/auth/require-capability";
import { getCategories, getStorageLocations } from "@/lib/catalog/queries";

export default async function NewInventoryItemPage() {
  await requireAnyCapability(["inventory:manage"]);
  const [categories, storageLocations] = await Promise.all([
    getCategories(),
    getStorageLocations()
  ]);
  return (
    <AppShell mode="staff">
      <div className="page-head">
        <div>
          <p className="eyebrow">Catalog / Inventory</p>
          <h1>Add a catalog item</h1>
          <p>Set the tracking mode carefully — it cannot be changed after creation.</p>
        </div>
      </div>
      <CatalogItemForm mode="create" categories={categories} storageLocations={storageLocations} />
    </AppShell>
  );
}
