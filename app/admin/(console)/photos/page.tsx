import { PhotoReviewCard, type QueueItem } from "@/components/admin/photo-review-card";
import { reviewPhotoAction } from "@/lib/admin/photo-actions";
import { requireStaff } from "@/lib/auth/staff";
import { timeAgo } from "@/lib/domain/time";
import { signReviewPhotos } from "@/lib/storage/photos";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Photo queue" };

/** Spec §21 Photo queue: pending photos, oldest first; approve / reject with reason (§11 rules). */
export default async function PhotoQueuePage() {
  await requireStaff();
  // The queue function itself checks is_staff() (role + aal2) and returns no storage paths.
  const { data: rows, error } = await (await createClient()).rpc("staff_photo_queue", { p_limit: 30 });
  const queue = error ? [] : (rows ?? []);
  // Signed only after the staff check above; only photos still waiting for review get a URL.
  const urls = await signReviewPhotos(queue.map((r) => r.photo_id));

  const items: QueueItem[] = queue.map((r) => ({
    photoId: r.photo_id,
    memberLabel: r.display_name ? `${r.display_name}, ${r.age}` : "Member",
    isPrimary: r.is_primary,
    position: r.sort_order + 1,
    waiting: timeAgo(r.uploaded_at),
    approvedCount: Number(r.approved_count),
    url: urls.get(r.photo_id) ?? null,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-[34px] font-bold">Photo queue</h1>
        <p className="text-muted-foreground">
          Oldest first · not allowed: nudity or suggestive poses, text, numbers or handles, children, someone else’s
          photo · main photo must clearly show the member’s face
        </p>
      </div>
      {error ? <p role="alert">The queue couldn’t load. Refresh to try again.</p> : null}
      {items.length === 0 && !error ? (
        <p className="rounded-card border border-dashed border-border p-8 text-center text-muted-foreground">
          No photos waiting. Nice work.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-5 xl:grid-cols-4">
          {items.map((item) => (
            <PhotoReviewCard key={item.photoId} item={item} action={reviewPhotoAction} />
          ))}
        </div>
      )}
    </div>
  );
}
