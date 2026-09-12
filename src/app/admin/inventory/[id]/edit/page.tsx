import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { CatalogItemForm } from "@/components/inventory/catalog-item-form";
import { requireAnyCapability } from "@/lib/auth/require-capability";
import { getCategories, getCatalogItemForEdit, getStorageLocations } from "@/lib/catalog/queries";

export default async function EditInventoryItemPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAnyCapability(["inventory:manage"]);
  const { id } = await params;
  const [categories, storageLocations, item] = await Promise.all([
    getCategories(),
    getStorageLocations(),
    getCatalogItemForEdit(id)
  ]);
  if (!item) notFound();
  return (
    <AppShell mode="staff">
      <div className="page-head">
        <div>
          <p className="eyebrow">Catalog / Inventory</p>
          <h1>Edit {item.name}</h1>
          <p>Tracking mode is fixed at creation and cannot be changed here.</p>
        </div>
      </div>
      <CatalogItemForm
        mode="edit"
        categories={categories}
        storageLocations={storageLocations}
        item={item}
      />
    </AppShell>
  );
}
