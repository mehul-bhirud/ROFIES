"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import type { CatalogItemDetail, Category, StorageLocation } from "@/lib/catalog/types";

const conditions = ["perfect", "minor_damage", "repair_required", "not_working"] as const;
const trackingModes = ["pooled_reusable", "individual_asset", "consumable"] as const;

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function CatalogItemForm({
  mode,
  categories,
  storageLocations,
  item
}: {
  mode: "create" | "edit";
  categories: readonly Category[];
  storageLocations: readonly StorageLocation[];
  item?: CatalogItemDetail;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ state: "success" | "error"; message: string } | null>(
    null
  );
  const [trackingMode, setTrackingMode] = useState<CatalogItemDetail["trackingMode"]>(
    item?.trackingMode ?? "pooled_reusable"
  );

  function submit(formData: FormData) {
    startTransition(async () => {
      setResult(null);
      const idempotencyKey = crypto.randomUUID();
      const numberOrUndefined = (name: string) => {
        const raw = formData.get(name);
        return raw === null || raw === "" ? undefined : Number(raw);
      };
      const textOrUndefined = (name: string) => {
        const raw = formData.get(name);
        return raw === null || raw === "" ? undefined : String(raw);
      };
      const metadata = {
        categoryId: String(formData.get("categoryId")),
        name: String(formData.get("name")),
        description: textOrUndefined("description"),
        publicRemarks: textOrUndefined("publicRemarks"),
        internalRemarks: textOrUndefined("internalRemarks"),
        defaultLoanDays: numberOrUndefined("defaultLoanDays"),
        maximumLoanDays: numberOrUndefined("maximumLoanDays"),
        memberQuantityLimit: numberOrUndefined("memberQuantityLimit"),
        pickupWindowHours: numberOrUndefined("pickupWindowHours"),
        waitlistEnabled: formData.get("waitlistEnabled") === "on",
        counterIssueEnabled: formData.get("counterIssueEnabled") === "on",
        lowStockThreshold: numberOrUndefined("lowStockThreshold"),
        acquisitionDate: textOrUndefined("acquisitionDate"),
        supplier: textOrUndefined("supplier"),
        warrantyUntil: textOrUndefined("warrantyUntil"),
        replacementCost: numberOrUndefined("replacementCost"),
        tags: parseTags(String(formData.get("tags") ?? ""))
      };
      const command = mode === "create" ? "createCatalogItem" : "updateCatalogItem";
      const openingQuantity = numberOrUndefined("openingQuantity");
      const payload =
        mode === "create"
          ? {
              ...metadata,
              trackingMode,
              openingUnits:
                trackingMode === "individual_asset"
                  ? String(formData.get("assetIdentifiers") ?? "")
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean)
                      .map((localIdentifier) => ({
                        localIdentifier,
                        storageLocationId: textOrUndefined("openingStorageLocationId"),
                        condition: String(formData.get("openingCondition") ?? "perfect")
                      }))
                  : openingQuantity
                    ? [
                        {
                          storageLocationId: textOrUndefined("openingStorageLocationId"),
                          condition: String(formData.get("openingCondition") ?? "perfect"),
                          quantity: openingQuantity
                        }
                      ]
                    : [],
              idempotencyKey
            }
          : {
              ...metadata,
              catalogItemId: item!.id,
              reason: String(formData.get("reason")),
              idempotencyKey
            };
      try {
        const response = await fetch(`/api/commands/${command}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
          body: JSON.stringify(payload)
        });
        const body = (await response.json()) as { message?: string; referenceId?: string };
        setResult(
          response.ok
            ? {
                state: "success",
                message:
                  mode === "create"
                    ? "Catalog item created and audit event recorded."
                    : "Catalog item updated and audit event recorded."
              }
            : {
                state: "error",
                message:
                  body.message ??
                  `Operation failed. Reference ${body.referenceId ?? "unavailable"}.`
              }
        );
        if (response.ok && mode === "create") {
          setTrackingMode("pooled_reusable");
        }
      } catch {
        setResult({
          state: "error",
          message: "Network unavailable. The operation was not confirmed; retry."
        });
      }
    });
  }

  return (
    <form className="command-card" action={submit}>
      <header>
        <h2>{mode === "create" ? "Add a catalog item" : `Edit ${item?.name}`}</h2>
        <p>Metadata changes are audited. Stock and custody are tracked separately.</p>
      </header>
      <div className="form-field">
        <label htmlFor="categoryId">Category</label>
        <select id="categoryId" name="categoryId" defaultValue={item?.categoryId ?? ""} required>
          <option value="" disabled>
            Select a category
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label htmlFor="name">Name</label>
        <input
          id="name"
          name="name"
          minLength={2}
          maxLength={160}
          defaultValue={item?.name}
          required
        />
      </div>
      <div className="form-field">
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          name="description"
          maxLength={4000}
          defaultValue={item?.description}
        />
      </div>
      {mode === "create" ? (
        <fieldset className="decision-line">
          <legend>Tracking mode (cannot be changed later)</legend>
          {trackingModes.map((option) => (
            <label key={option} className="form-field">
              <input
                type="radio"
                name="trackingModeChoice"
                value={option}
                checked={trackingMode === option}
                onChange={() => setTrackingMode(option)}
              />
              {option.replaceAll("_", " ")}
            </label>
          ))}
        </fieldset>
      ) : (
        <div className="form-field">
          <label>Tracking mode</label>
          <input value={item?.trackingMode.replaceAll("_", " ")} disabled />
        </div>
      )}
      <div className="form-field">
        <label htmlFor="publicRemarks">Public remarks</label>
        <textarea
          id="publicRemarks"
          name="publicRemarks"
          maxLength={2000}
          defaultValue={item?.publicRemarks}
        />
      </div>
      <div className="form-field">
        <label htmlFor="internalRemarks">Internal remarks (staff only)</label>
        <textarea
          id="internalRemarks"
          name="internalRemarks"
          maxLength={4000}
          defaultValue={item?.internalRemarks}
        />
      </div>
      <div className="form-field">
        <label htmlFor="defaultLoanDays">Default loan days</label>
        <input
          id="defaultLoanDays"
          name="defaultLoanDays"
          type="number"
          min={1}
          max={90}
          defaultValue={item?.defaultLoanDays ?? undefined}
        />
      </div>
      <div className="form-field">
        <label htmlFor="maximumLoanDays">Maximum loan days</label>
        <input
          id="maximumLoanDays"
          name="maximumLoanDays"
          type="number"
          min={1}
          max={180}
          defaultValue={item?.maximumLoanDays ?? undefined}
        />
      </div>
      <div className="form-field">
        <label htmlFor="memberQuantityLimit">Member quantity limit</label>
        <input
          id="memberQuantityLimit"
          name="memberQuantityLimit"
          type="number"
          min={1}
          defaultValue={item?.memberQuantityLimit ?? undefined}
        />
      </div>
      <div className="form-field">
        <label htmlFor="pickupWindowHours">Pickup window (hours)</label>
        <input
          id="pickupWindowHours"
          name="pickupWindowHours"
          type="number"
          min={1}
          max={168}
          defaultValue={item?.pickupWindowHours ?? undefined}
        />
      </div>
      <div className="form-field">
        <label htmlFor="lowStockThreshold">Low-stock threshold</label>
        <input
          id="lowStockThreshold"
          name="lowStockThreshold"
          type="number"
          min={0}
          defaultValue={item?.lowStockThreshold ?? undefined}
        />
      </div>
      <div className="form-field">
        <label>
          <input
            type="checkbox"
            name="waitlistEnabled"
            defaultChecked={item?.waitlistEnabled ?? true}
          />
          Allow waitlisting
        </label>
      </div>
      <div className="form-field">
        <label>
          <input
            type="checkbox"
            name="counterIssueEnabled"
            defaultChecked={item?.counterIssueEnabled ?? false}
          />
          Allow counter issue (consumables only)
        </label>
      </div>
      <div className="form-field">
        <label htmlFor="acquisitionDate">Acquisition date</label>
        <input
          id="acquisitionDate"
          name="acquisitionDate"
          type="date"
          defaultValue={item?.acquisitionDate ?? ""}
        />
      </div>
      <div className="form-field">
        <label htmlFor="supplier">Supplier</label>
        <input id="supplier" name="supplier" maxLength={200} defaultValue={item?.supplier ?? ""} />
      </div>
      <div className="form-field">
        <label htmlFor="warrantyUntil">Warranty until</label>
        <input
          id="warrantyUntil"
          name="warrantyUntil"
          type="date"
          defaultValue={item?.warrantyUntil ?? ""}
        />
      </div>
      <div className="form-field">
        <label htmlFor="replacementCost">Replacement cost</label>
        <input
          id="replacementCost"
          name="replacementCost"
          type="number"
          min={0}
          step="0.01"
          defaultValue={item?.replacementCost ?? undefined}
        />
      </div>
      <div className="form-field">
        <label htmlFor="tags">Tags (comma separated)</label>
        <input id="tags" name="tags" defaultValue={item?.tags.join(", ")} />
      </div>
      {mode === "create" ? (
        <fieldset className="decision-line">
          <legend>
            {trackingMode === "individual_asset" ? "Units (optional)" : "Opening stock (optional)"}
          </legend>
          <div className="form-field">
            <label htmlFor="openingStorageLocationId">Storage location</label>
            <select id="openingStorageLocationId" name="openingStorageLocationId" defaultValue="">
              <option value="">Unassigned</option>
              {storageLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="openingCondition">Condition</label>
            <select id="openingCondition" name="openingCondition" defaultValue="perfect">
              {conditions.map((condition) => (
                <option key={condition} value={condition}>
                  {condition.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
          {trackingMode === "individual_asset" ? (
            <div className="form-field">
              <label htmlFor="assetIdentifiers">Unit identifiers, one per line</label>
              <textarea
                id="assetIdentifiers"
                name="assetIdentifiers"
                placeholder={"RN-JET-01\nRN-JET-02"}
              />
            </div>
          ) : (
            <div className="form-field">
              <label htmlFor="openingQuantity">Quantity</label>
              <input id="openingQuantity" name="openingQuantity" type="number" min={1} max={1000} />
            </div>
          )}
        </fieldset>
      ) : null}
      {mode === "edit" ? (
        <div className="form-field">
          <label htmlFor="reason">Reason for this change</label>
          <textarea id="reason" name="reason" minLength={3} maxLength={1000} required />
        </div>
      ) : null}
      <button className="button button-primary" type="submit" disabled={pending}>
        {pending ? (
          <LoaderCircle className="spin" size={18} aria-hidden="true" />
        ) : (
          <CheckCircle2 size={18} aria-hidden="true" />
        )}
        {pending ? "Committing…" : mode === "create" ? "Create item" : "Save changes"}
      </button>
      {result ? (
        <div className="command-result" data-state={result.state} role="status">
          {result.message}
        </div>
      ) : null}
    </form>
  );
}
