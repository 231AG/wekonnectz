import "server-only";

import { SIGNED_URL_SECONDS } from "@/lib/storage/photos";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Viewing another member's profile (spec §11 "Who sees what", §17). The database decides access
 * (can_view_profile: both ACTIVE, no block either way, not hidden by reports); photos are signed only
 * after that check and storage paths never leave this module (spec §6 rule 5).
 */

export type ProfileView = {
  userId: string;
  displayName: string;
  age: number;
  area: string | null;
  bio: string | null;
  intentRelationship: boolean;
  intentCasual: boolean;
  verified: boolean;
  interests: string[];
  photos: { id: string; url: string }[];
  /** The open conversation with this member when you are matched. */
  conversationId: string | null;
};

export async function viewProfile(viewerId: string, ownerId: string): Promise<ProfileView | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("member_profile_for_viewer", { p_viewer: viewerId, p_owner: ownerId });
  if (error || !data) return null;
  const p = data as Record<string, unknown>;
  const { data: photos } = await admin.rpc("photos_for_viewer", { p_viewer: viewerId, p_owner: ownerId });
  const rows = photos ?? [];
  const signed = rows.length
    ? (
        await admin.storage.from("photos").createSignedUrls(
          rows.map((r) => r.storage_path),
          SIGNED_URL_SECONDS,
        )
      ).data
    : [];
  const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return {
    userId: String(p.user_id),
    displayName: String(p.display_name ?? ""),
    age: Number(p.age),
    area: (p.area as string | null) ?? null,
    bio: (p.bio as string | null) ?? null,
    intentRelationship: p.intent_relationship === true,
    intentCasual: p.intent_casual === true,
    verified: p.verified === true,
    interests: Array.isArray(p.interests) ? (p.interests as string[]) : [],
    conversationId: (p.conversation_id as string | null) ?? null,
    photos: rows.flatMap((r) => (byPath.get(r.storage_path) ? [{ id: r.id, url: byPath.get(r.storage_path)! }] : [])),
  };
}

export async function blockedList(userId: string): Promise<{ userId: string; displayName: string | null }[]> {
  const { data, error } = await createAdminClient().rpc("member_blocked_list", { p_user_id: userId });
  if (error || !data) return [];
  return data.map((r) => ({ userId: r.user_id, displayName: r.display_name }));
}

/**
 * Photos of a reported member for the staff report panel, including a photo hidden by the report.
 * The caller must have checked the staff session (requireStaff).
 */
export async function signReportPhotos(
  reportId: string,
): Promise<{ id: string; url: string; status: string; isReported: boolean }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("report_review_paths", { p_report_id: reportId });
  if (error || !data?.length) return [];
  const { data: signed } = await admin.storage.from("photos").createSignedUrls(
    data.map((r) => r.storage_path),
    SIGNED_URL_SECONDS,
  );
  const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return data.flatMap((r) =>
    byPath.get(r.storage_path)
      ? [{ id: r.id, url: byPath.get(r.storage_path)!, status: String(r.status), isReported: r.is_reported }]
      : [],
  );
}
