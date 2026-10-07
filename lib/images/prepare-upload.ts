/**
 * Browser-side preparation before upload: decode, apply the camera orientation and shrink to at most
 * 2048 px as a JPEG. Saves mobile data and turns iPhone HEIC photos into something the server reads.
 * This is a convenience only — the server validates and re-encodes every file itself (spec §11).
 * If the browser can't decode the file, the original is sent and the server decides.
 */
const MAX_SIDE = 2048;

export async function prepareForUpload(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** Uploads to a signed upload URL (the URL carries a one-off token; no session is sent). */
export async function putToSignedUrl(uploadUrl: string, body: Blob): Promise<boolean> {
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", body);
  try {
    const res = await fetch(uploadUrl, { method: "PUT", body: form, headers: { "x-upsert": "false" } });
    return res.ok;
  } catch {
    return false;
  }
}
