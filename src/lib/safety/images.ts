import sharp from "sharp";

const allowedFormats = new Set(["jpeg", "png", "webp", "avif"]);
const collegeIdFormats = new Set(["jpeg", "png", "webp"]);

export const MAX_COLLEGE_ID_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_COLLEGE_ID_STORED_BYTES = 5 * 1024 * 1024;

function hasExpectedCollegeIdSignature(input: Buffer, format: string) {
  if (format === "jpeg")
    return input.length >= 3 && input.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (format === "png")
    return (
      input.length >= 8 &&
      input.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  if (format === "webp")
    return (
      input.length >= 12 &&
      input.subarray(0, 4).toString("ascii") === "RIFF" &&
      input.subarray(8, 12).toString("ascii") === "WEBP"
    );
  return false;
}

export async function normalizeEquipmentPhoto(input: Buffer) {
  if (input.byteLength === 0 || input.byteLength > 8 * 1024 * 1024)
    throw new Error("invalid_image_size");
  const image = sharp(input, { failOn: "warning", limitInputPixels: 64_000_000 });
  const metadata = await image.metadata();
  if (
    !metadata.format ||
    !allowedFormats.has(metadata.format) ||
    !metadata.width ||
    !metadata.height
  )
    throw new Error("invalid_image_format");
  if (metadata.width > 8000 || metadata.height > 8000 || (metadata.pages ?? 1) !== 1)
    throw new Error("invalid_image_dimensions");
  const { data, info } = await image
    .rotate()
    .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 84, effort: 5 })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, contentType: "image/webp" as const };
}

export async function normalizeCollegeId(input: Buffer) {
  if (input.byteLength === 0 || input.byteLength > MAX_COLLEGE_ID_SOURCE_BYTES)
    throw new Error("invalid_college_id_size");
  const image = sharp(input, { failOn: "warning", limitInputPixels: 16_777_216 });
  const metadata = await image.metadata();
  if (
    !metadata.format ||
    !collegeIdFormats.has(metadata.format) ||
    !hasExpectedCollegeIdSignature(input, metadata.format)
  )
    throw new Error("invalid_college_id_format");
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width > 4096 ||
    metadata.height > 4096 ||
    metadata.width * metadata.height > 16_777_216 ||
    (metadata.pages ?? 1) !== 1
  )
    throw new Error("invalid_college_id_dimensions");
  const { data, info } = await image
    .rotate()
    .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 84, effort: 5 })
    .toBuffer({ resolveWithObject: true });
  if (data.byteLength === 0 || data.byteLength > MAX_COLLEGE_ID_STORED_BYTES)
    throw new Error("invalid_college_id_output_size");
  return {
    data,
    width: info.width,
    height: info.height,
    byteSize: data.byteLength,
    contentType: "image/webp" as const
  };
}
