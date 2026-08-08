"use client";

import { useState, type FormEvent } from "react";
import { ImagePlus } from "lucide-react";

export function EquipmentPhotoUpload({
  items
}: {
  items: readonly { id: string; name: string }[];
}) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setMessage("");
    const response = await fetch("/api/uploads/equipment-photo", {
      method: "POST",
      body: new FormData(form)
    }).catch(() => null);
    if (!response) setMessage("Upload could not reach the server. Try again.");
    else if (response.ok) {
      form.reset();
      setMessage("Photo processed, stored privately, and added to the item record.");
    } else {
      const body = (await response.json().catch(() => ({ message: "Upload failed" }))) as {
        message?: string;
      };
      setMessage(body.message ?? "Upload failed");
    }
    setPending(false);
  }
  return (
    <section className="panel photo-upload-panel" aria-labelledby="photo-upload-title">
      <div className="panel-head">
        <div>
          <h2 id="photo-upload-title">Add equipment photo</h2>
          <p>
            Images are decoded, resized, stripped of metadata, and stored in the private equipment
            bucket.
          </p>
        </div>
        <ImagePlus size={22} aria-hidden="true" />
      </div>
      <form className="photo-upload-form" onSubmit={submit}>
        <label>
          Equipment
          <select name="catalogId" required defaultValue="">
            <option value="" disabled>
              Select an item
            </option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Photo
          <input
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            required
          />
        </label>
        <label>
          Caption
          <input name="caption" maxLength={300} placeholder="Optional, factual description" />
        </label>
        <button className="button button-primary" disabled={pending}>
          {pending ? "Processing…" : "Process and add photo"}
        </button>
        <p className="form-status" aria-live="polite">
          {message}
        </p>
      </form>
    </section>
  );
}
