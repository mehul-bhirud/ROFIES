import { Download, Plus, Wrench } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { EquipmentPhotoUpload } from "@/components/inventory/equipment-photo-upload";
import { InventoryRowActions } from "@/components/inventory/inventory-row-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAnyCapability } from "@/lib/auth/require-capability";
import { getInventoryListItems, getStorageLocations } from "@/lib/catalog/queries";

export default async function InventoryPage() {
  await requireAnyCapability(["inventory:manage"]);
  const [items, storageLocations] = await Promise.all([getInventoryListItems(), getStorageLocations()]);
  return (
    <AppShell mode="staff">
      <div className="page-head">
        <div>
          <p className="eyebrow">Catalog / Inventory</p>
          <h1>Condition, custody, and location</h1>
          <p>
            Internal remarks, replacement cost, and precise storage are restricted to authorized
            staff.
          </p>
        </div>
        <div className="head-actions">
          <Link href="/admin/inventory/new" className="button button-primary">
            <Plus size={18} aria-hidden="true" />
            Add item
          </Link>
          <a href="/api/exports/inventory" className="button button-secondary">
            <Download size={18} aria-hidden="true" />
            Safe CSV
          </a>
        </div>
      </div>
      <EquipmentPhotoUpload items={items.map(({ id, name }) => ({ id, name }))} />
      <section className="panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Mode</th>
                <th>Usable</th>
                <th>Repair</th>
                <th>State</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td data-label="Item">
                    <strong>{item.name}</strong>
                    <span className="data-id">{item.id.slice(-8)}</span>
                  </td>
                  <td data-label="Mode">{item.trackingMode.replaceAll("_", " ")}</td>
                  <td data-label="Usable">{item.usableOnHand}</td>
                  <td data-label="Repair">{item.repairQuantity}</td>
                  <td data-label="State">
                    {item.archivedAt ? (
                      <StatusBadge tone="neutral">Archived</StatusBadge>
                    ) : (
                      <StatusBadge tone={item.repairQuantity ? "warning" : "success"}>
                        {item.repairQuantity ? (
                          <>
                            <Wrench size={14} aria-hidden="true" /> Repair split
                          </>
                        ) : (
                          "Operational"
                        )}
                      </StatusBadge>
                    )}
                  </td>
                  <td data-label="Actions">
                    <Link href={`/admin/inventory/${item.id}/edit`} className="button button-secondary">
                      Edit
                    </Link>
                    <InventoryRowActions
                      catalogItemId={item.id}
                      archivedAt={item.archivedAt}
                      trackingMode={item.trackingMode}
                      storageLocations={storageLocations}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
