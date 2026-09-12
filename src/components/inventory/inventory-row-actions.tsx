"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, LoaderCircle, Trash2 } from "lucide-react";
import type { StorageLocation } from "@/lib/catalog/types";

const conditions = ["perfect", "minor_damage", "repair_required", "not_working"] as const;

async function runCommand(command: string, payload: Record<string, unknown>) {
  const idempotencyKey = crypto.randomUUID();
  const response = await fetch(`/api/commands/${command}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ ...payload, idempotencyKey })
  });
  const body = (await response.json()) as { message?: string; referenceId?: string };
  return {
    ok: response.ok,
    message: response.ok ? "Committed." : (body.message ?? `Failed. Reference ${body.referenceId ?? "unavailable"}.`)
  };
}

export function InventoryRowActions({
  catalogItemId,
  archivedAt,
  trackingMode,
  storageLocations
}: {
  catalogItemId: string;
  archivedAt: string | null;
  trackingMode: "pooled_reusable" | "individual_asset" | "consumable";
  storageLocations: readonly StorageLocation[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  function lifecycleAction(command: "archiveCatalogItem" | "restoreCatalogItem", reason: string) {
    startTransition(async () => {
      const outcome = await runCommand(command, { catalogItemId, reason });
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });
  }

  function submitDelete(formData: FormData) {
    startTransition(async () => {
      const outcome = await runCommand("deleteCatalogItem", { catalogItemId, reason: formData.get("reason") });
      setResult(outcome);
      if (outcome.ok) {
        setShowDelete(false);
        router.refresh();
      }
    });
  }

  function submitAdjustment(formData: FormData) {
    startTransition(async () => {
      const outcome = await runCommand("adjustStock", {
        catalogItemId,
        storageLocationId: formData.get("storageLocationId") || undefined,
        condition: formData.get("condition"),
        quantityDelta: Number(formData.get("quantityDelta")),
        reason: formData.get("reason")
      });
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });
  }

  function submitAddUnit(formData: FormData) {
    startTransition(async () => {
      const outcome = await runCommand("addIndividualAsset", {
        catalogItemId,
        localIdentifier: formData.get("localIdentifier") || undefined,
        storageLocationId: formData.get("storageLocationId") || undefined,
        condition: formData.get("condition"),
        reason: formData.get("reason")
      });
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });
  }

  return (
    <div className="inventory-row-actions">
      <div className="inventory-row-actions-buttons">
        {archivedAt ? (
          <button
            type="button"
            className="button button-secondary"
            disabled={pending}
            onClick={() => lifecycleAction("restoreCatalogItem", "Restored from Inventory page")}
          >
            <ArchiveRestore size={16} aria-hidden="true" /> Restore
          </button>
        ) : (
          <button
            type="button"
            className="button button-secondary"
            disabled={pending}
            onClick={() => lifecycleAction("archiveCatalogItem", "Archived from Inventory page")}
          >
            <Archive size={16} aria-hidden="true" /> Archive
          </button>
        )}
        <button
          type="button"
          className="button button-danger"
          disabled={pending}
          onClick={() => setShowDelete((value) => !value)}
        >
          <Trash2 size={16} aria-hidden="true" /> Delete
        </button>
        {trackingMode !== "individual_asset" ? (
          <button type="button" className="button button-secondary" onClick={() => setShowAdjust((value) => !value)}>
            Adjust stock
          </button>
        ) : (
          <button type="button" className="button button-secondary" onClick={() => setShowAddUnit((value) => !value)}>
            Add unit
          </button>
        )}
      </div>
      {showDelete ? (
        <form className="command-card" action={submitDelete}>
          <div className="form-field">
            <label htmlFor={`deleteReason-${catalogItemId}`}>
              Reason (this permanently deletes the item — only unused items can be deleted)
            </label>
            <textarea id={`deleteReason-${catalogItemId}`} name="reason" minLength={3} maxLength={1000} required />
          </div>
          <button className="button button-danger" type="submit" disabled={pending}>
            {pending ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : "Confirm permanent delete"}
          </button>
        </form>
      ) : null}
      {showAddUnit ? (
        <form className="command-card" action={submitAddUnit}>
          <div className="form-field">
            <label htmlFor={`localIdentifier-${catalogItemId}`}>Unit identifier (optional)</label>
            <input id={`localIdentifier-${catalogItemId}`} name="localIdentifier" maxLength={120} />
          </div>
          <div className="form-field">
            <label htmlFor={`unitStorageLocationId-${catalogItemId}`}>Storage location</label>
            <select id={`unitStorageLocationId-${catalogItemId}`} name="storageLocationId" defaultValue="">
              <option value="">Unassigned</option>
              {storageLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor={`unitCondition-${catalogItemId}`}>Condition</label>
            <select id={`unitCondition-${catalogItemId}`} name="condition" defaultValue="perfect">
              {conditions.map((condition) => (
                <option key={condition} value={condition}>
                  {condition.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor={`unitReason-${catalogItemId}`}>Reason</label>
            <textarea id={`unitReason-${catalogItemId}`} name="reason" minLength={3} maxLength={1000} required />
          </div>
          <button className="button button-primary" type="submit" disabled={pending}>
            {pending ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : "Confirm new unit"}
          </button>
        </form>
      ) : null}
      {showAdjust ? (
        <form className="command-card" action={submitAdjustment}>
          <div className="form-field">
            <label htmlFor={`storageLocationId-${catalogItemId}`}>Storage location</label>
            <select id={`storageLocationId-${catalogItemId}`} name="storageLocationId" defaultValue="">
              <option value="">Unassigned</option>
              {storageLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor={`condition-${catalogItemId}`}>Condition</label>
            <select id={`condition-${catalogItemId}`} name="condition" defaultValue="perfect">
              {conditions.map((condition) => (
                <option key={condition} value={condition}>
                  {condition.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor={`quantityDelta-${catalogItemId}`}>
              Quantity change (use a negative number to remove stock)
            </label>
            <input id={`quantityDelta-${catalogItemId}`} name="quantityDelta" type="number" required />
          </div>
          <div className="form-field">
            <label htmlFor={`reason-${catalogItemId}`}>Reason</label>
            <textarea id={`reason-${catalogItemId}`} name="reason" minLength={3} maxLength={1000} required />
          </div>
          <button className="button button-primary" type="submit" disabled={pending}>
            {pending ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : "Confirm adjustment"}
          </button>
        </form>
      ) : null}
      {result ? (
        <p className="command-result" data-state={result.ok ? "success" : "error"} role="status">
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
