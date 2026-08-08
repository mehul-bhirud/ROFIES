import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { normalizeEquipmentPhoto } from "@/lib/safety/images";

describe("equipment image normalization", () => {
  it("decodes and re-encodes a bounded, single-frame image as metadata-free WebP", async () => {
    const source = await sharp({
      create: { width: 320, height: 200, channels: 3, background: "#0ea5a4" }
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Artist: "Private metadata" } } })
      .toBuffer();
    const result = await normalizeEquipmentPhoto(source);
    const metadata = await sharp(result.data).metadata();
    expect({
      format: metadata.format,
      width: result.width,
      height: result.height,
      pages: metadata.pages ?? 1
    }).toEqual({ format: "webp", width: 320, height: 200, pages: 1 });
    expect(metadata.exif).toBeUndefined();
  });
  it("rejects content that is not a decodable image", async () => {
    await expect(normalizeEquipmentPhoto(Buffer.from("not-an-image"))).rejects.toThrow();
  });
});
