"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { LoaderCircle, Plus, Star } from "lucide-react";

import { FormError } from "@/components/layout/mobile-screen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { prepareForUpload, putToSignedUrl } from "@/lib/images/prepare-upload";
import type { PhotosResult, UploadSlot } from "@/lib/photos/actions";
import { REJECTION_REASONS } from "@/lib/photos/reasons";
import type { OwnPhoto } from "@/lib/storage/photos";

type Actions = {
  requestUpload: () => Promise<UploadSlot>;
  completeUpload: (photoId: string) => Promise<PhotosResult>;
  makeMain: (photoId: string) => Promise<PhotosResult>;
  remove: (photoId: string) => Promise<PhotosResult>;
  refresh: () => Promise<PhotosResult>;
  continueStep: () => Promise<{ error: string }>;
};

const STATUS: Record<OwnPhoto["status"], { label: string; tone: "approved" | "pending" | "danger" | "neutral" }> = {
  APPROVED: { label: "Approved", tone: "approved" },
  PENDING_REVIEW: { label: "In review", tone: "pending" },
  REJECTED: { label: "Not approved", tone: "danger" },
  HIDDEN: { label: "Hidden", tone: "neutral" },
  UPLOADING: { label: "Uploading", tone: "neutral" },
  DELETED: { label: "Removed", tone: "neutral" },
};

/** Spec §10 step 9 / mock-up 06: 3 required, up to 6; the first photo is the main photo. */
function PhotosManager({
  initialPhotos,
  required,
  max,
  actions,
}: {
  initialPhotos: OwnPhoto[];
  required: number;
  max: number;
  actions: Actions;
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [error, setError] = useState<string>();
  const [uploading, setUploading] = useState(0);
  const [selected, setSelected] = useState<OwnPhoto | null>(null);
  const [sheetBusy, startSheetAction] = useTransition();
  const refreshed = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const [continueState, continueAction, continuing] = useActionState(actions.continueStep, { error: "" });

  const usable = photos.filter((p) => p.status === "APPROVED" || p.status === "PENDING_REVIEW").length;
  const free = Math.max(0, max - photos.length - uploading);

  function apply(result: PhotosResult) {
    setPhotos(result.photos);
    setError(result.error);
  }

  async function uploadFiles(files: File[]) {
    setError(undefined);
    const batch = files.slice(0, free);
    if (files.length > batch.length) setError(`You can add ${free} more photo${free === 1 ? "" : "s"}.`);
    for (const file of batch) {
      setUploading((n) => n + 1);
      try {
        const slot = await actions.requestUpload();
        if ("error" in slot) {
          setError(slot.error);
          break;
        }
        await putToSignedUrl(slot.uploadUrl, await prepareForUpload(file));
        // Always finish: the server checks the file (or frees the slot if the upload failed).
        const result = await actions.completeUpload(slot.photoId);
        apply(result);
        if (result.error) break;
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function runSheetAction(action: (id: string) => Promise<PhotosResult>) {
    if (!selected) return;
    const id = selected.id;
    startSheetAction(async () => {
      apply(await action(id));
      setSelected(null);
    });
  }

  // Signed URLs last 120 s; if one has expired (page left open), fetch fresh ones once.
  function onImageError() {
    if (refreshed.current) return;
    refreshed.current = true;
    actions.refresh().then(apply);
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2.5" role="list" aria-label="Your photos">
        {photos.map((photo, index) => {
          const status = STATUS[photo.status];
          const label = `Photo ${index + 1}${photo.isPrimary ? ", main photo" : ""}, ${status.label.toLowerCase()}`;
          return (
            <div role="listitem" key={photo.id}>
              <button
                type="button"
                onClick={() => setSelected(photo)}
                aria-label={`${label}. Photo options`}
                className="relative block h-[150px] w-full overflow-hidden rounded-card bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {photo.url ? (
                  // Signed, short-lived URLs from private storage; next/image would proxy and cache them.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.url} alt="" onError={onImageError} className="size-full object-cover" />
                ) : null}
                {photo.isPrimary ? (
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-bold">
                    <Star className="size-3" aria-hidden /> Main
                  </span>
                ) : null}
                <Badge tone={status.tone} className="absolute bottom-2 left-2 px-2 py-0.5 text-[11px]">
                  {status.label}
                </Badge>
              </button>
            </div>
          );
        })}
        {Array.from({ length: uploading }, (_, i) => (
          <div
            role="listitem"
            key={`uploading-${i}`}
            className="flex h-[150px] flex-col items-center justify-center gap-2 rounded-card bg-surface-2 text-xs text-muted-foreground"
          >
            <LoaderCircle className="size-6 animate-spin" aria-hidden />
            <span role="status">Uploading…</span>
          </div>
        ))}
        {Array.from({ length: free }, (_, i) => (
          <div role="listitem" key={`empty-${i}`}>
            <button
              type="button"
              onClick={() => input.current?.click()}
              aria-label="Add photo"
              className="flex h-[150px] w-full items-center justify-center rounded-card border-[1.5px] border-dashed border-border text-muted-foreground hover:border-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Plus className="size-6" strokeWidth={1.8} aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="photo-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) void uploadFiles(files);
        }}
      />

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {usable >= required
          ? `${usable} photo${usable === 1 ? "" : "s"} added. Moderators review every photo.`
          : `${usable} of ${required} required photos added.`}
      </p>
      <FormError>{error}</FormError>

      <div className="flex flex-col gap-1.5 rounded-control border border-border bg-surface-1 p-3.5">
        <span className="text-[13px] font-bold">Not allowed</span>
        <p className="text-[13px] leading-[19px] text-muted-foreground">
          Nudity · text or phone numbers on photos · children · other people’s photos
        </p>
      </div>

      <div className="flex-1" />
      <form action={continueAction} className="flex flex-col gap-3">
        <FormError>{continueState.error}</FormError>
        <Button type="submit" disabled={continuing || uploading > 0 || usable < required}>
          Continue
        </Button>
      </form>

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected?.isPrimary ? "Main photo" : "Photo options"}
        description={
          selected?.status === "REJECTED" && selected.rejectionReason
            ? REJECTION_REASONS[selected.rejectionReason].member
            : selected?.isPrimary
              ? "Your main photo must clearly show your face."
              : undefined
        }
      >
        {selected && !selected.isPrimary && selected.status !== "REJECTED" && selected.status !== "HIDDEN" ? (
          <Button variant="secondary" disabled={sheetBusy} onClick={() => runSheetAction(actions.makeMain)}>
            Make main photo
          </Button>
        ) : null}
        <Button variant="danger" disabled={sheetBusy} onClick={() => runSheetAction(actions.remove)}>
          Remove photo
        </Button>
        <Button variant="ghost" onClick={() => setSelected(null)}>
          Cancel
        </Button>
      </Sheet>
    </>
  );
}

export { PhotosManager };
