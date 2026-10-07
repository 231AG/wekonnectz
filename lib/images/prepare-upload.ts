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

export type UploadOutcome = "ok" | "rejected" | "too-large" | "failed";

/** Uploads to a signed upload URL (the URL carries a one-off token; no session is sent). */
export async function putToSignedUrl(uploadUrl: string, body: Blob): Promise<UploadOutcome> {
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", body);
  try {
    const res = await fetch(uploadUrl, { method: "PUT", body: form, headers: { "x-upsert": "false" } });
    if (res.ok) return "ok";
    // The quarantine bucket refuses other file types (415) and files over its size limit (413).
    if (res.status === 415) return "rejected";
    if (res.status === 413) return "too-large";
    // Storage reports some refusals as 400 with the reason in the body.
    const text = await res.text().catch(() => "");
    if (/mime type|invalid_mime_type/i.test(text)) return "rejected";
    if (/maximum allowed size|entity too large/i.test(text)) return "too-large";
    return "failed";
  } catch {
    return "failed";
  }
}
