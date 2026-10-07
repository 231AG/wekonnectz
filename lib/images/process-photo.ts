import sharp, { type Metadata } from "sharp";

/**
 * Server-side photo processing (spec §4 "Image processing", §11 upload pipeline, BR-12).
 * Imported only by server-only modules; kept free of next/* and Supabase so it is unit-tested.
 *
 * Nothing the member's device sends is trusted: the type comes from the file's own bytes, the image
 * is decoded and re-encoded, and the output carries no metadata at all (EXIF, GPS, XMP, ICC, comments).
 */

/** Largest upload accepted, before processing. The quarantine bucket enforces the same limit. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Longest side of the stored photo. */
export const MAX_DIMENSION = 1600;
/** Shortest side a photo may have: smaller images can't show a face clearly (spec §11). */
export const MIN_DIMENSION = 320;
/** Refuse decompression bombs: images that claim more pixels than this are never decoded. */
const MAX_INPUT_PIXELS = 50_000_000;

export type ImageKind = "jpeg" | "png" | "webp";

export type PhotoRejection = "TOO_LARGE" | "NOT_AN_IMAGE" | "TOO_SMALL";

export class PhotoRejectedError extends Error {
  constructor(readonly reason: PhotoRejection) {
    super(reason);
    this.name = "PhotoRejectedError";
  }
}

/** The image type by magic bytes, ignoring file names and the declared content type. */
export function sniffImageType(bytes: Uint8Array): ImageKind | null {
  const at = (i: number) => bytes[i];
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => at(i) === b)) {
    return "png";
  }
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  return null;
}

/**
 * Validates and re-encodes a photo: magic bytes, size cap, decodes fully, applies the camera
 * orientation, resizes to fit MAX_DIMENSION, converts to WebP and drops every metadata block.
 */
export async function processPhoto(input: Uint8Array): Promise<Buffer> {
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new PhotoRejectedError("TOO_LARGE");
  const kind = sniffImageType(input);
  if (!kind) throw new PhotoRejectedError("NOT_AN_IMAGE");

  const options = { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" as const, pages: 1 };
  let meta: Metadata;
  try {
    meta = await sharp(input, options).metadata();
  } catch {
    throw new PhotoRejectedError("NOT_AN_IMAGE");
  }
  // The decoder must agree with the magic bytes (a JPEG header glued onto something else fails here).
  if (meta.format !== kind || !meta.width || !meta.height) throw new PhotoRejectedError("NOT_AN_IMAGE");
  // Orientations 5–8 swap width and height once applied; either way the short side is the same.
  if (Math.min(meta.width, meta.height) < MIN_DIMENSION) throw new PhotoRejectedError("TOO_SMALL");

  try {
    // sharp writes no metadata unless asked (no withMetadata/keepExif here), so EXIF and GPS are gone.
    return await sharp(input, options)
      .rotate()
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new PhotoRejectedError("NOT_AN_IMAGE");
  }
}
