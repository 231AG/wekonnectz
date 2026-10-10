import "server-only";

import { signPaths } from "@/lib/storage/photos";
import { toMemberCard, type MemberCard } from "@/lib/storage/relationship";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Casual discovery and requests (spec §13, §14). The database decides who may see whom (pass, pool,
 * "interested in", blocks, decline cool-down); storage paths stay here and only signed URLs leave the
 * server (BR-11). Availability reaches the member only inside the pool (BR-19).
 */

export type PoolFilters = {
  areaId?: string;
  minAge?: number;
  maxAge?: number;
  interestIds?: string[];
  until?: Date;
};
export type PoolCard = MemberCard & { availableUntil: string; saved: boolean };
export type PoolPage = { cards: PoolCard[]; next: string | null };

/** Cursor: "<shuffle day>.<hour bucket>.<hash>" of the last card shown (the day keeps one order across midnight). */
function parseCursor(cursor: string | undefined): { day: string; bucket: number; hash: string } | null {
  const m = /^(\d{4}-\d{2}-\d{2})\.(\d{1,12})\.([0-9a-f]{32})$/.exec(cursor ?? "");
  return m ? { day: m[1], bucket: Number(m[2]), hash: m[3] } : null;
}

const PAGE = 20;

export async function poolPage(
  viewerId: string,
  f: PoolFilters,
  cursor?: string,
): Promise<PoolPage | { error: "NOT_ELIGIBLE" }> {
  const after = parseCursor(cursor);
  const { data, error } = await createAdminClient().rpc("pool_candidates", {
    p_viewer: viewerId,
    p_area_id: f.areaId,
    p_min_age: f.minAge,
    p_max_age: f.maxAge,
    p_interest_ids: f.interestIds,
    p_until: f.until?.toISOString(),
    p_after_bucket: after?.bucket,
    p_after_hash: after?.hash,
    p_day: after?.day,
    p_limit: PAGE + 1, // one extra row tells whether there is a next page
  });
  if (error) {
    if (error.message.includes("NOT_ELIGIBLE")) return { error: "NOT_ELIGIBLE" };
    throw new Error("pool unavailable");
  }
  const all = data ?? [];
  const rows = all.slice(0, PAGE);
  const urls = await signPaths(rows.flatMap((r) => (r.photo_path ? [r.photo_path] : [])));
  const cards = rows.map((r) => ({
    ...toMemberCard(r.card, r.photo_path ? (urls.get(r.photo_path) ?? null) : null),
    availableUntil: r.available_until,
    saved: r.saved,
  }));
  const last = rows.at(-1);
  const day = after?.day ?? new Date().toISOString().slice(0, 10);
  return { cards, next: all.length > PAGE && last ? `${day}.${last.bucket}.${last.sort_hash}` : null };
}

export type CasualProfile = MemberCard & {
  availableUntil: string | null;
  inPool: boolean;
  photos: { id: string; url: string }[];
  saved: boolean;
  requestSent: boolean;
  requestReceived: string | null;
  conversationId: string | null;
};

export async function casualProfile(viewerId: string, ownerId: string): Promise<CasualProfile | null> {
  const { data, error } = await createAdminClient().rpc("casual_profile", { p_viewer: viewerId, p_owner: ownerId });
  if (error || !data) return null;
  const d = data as {
    card: unknown;
    available_until: string | null;
    in_pool: boolean;
    photos: { id: string; path: string }[];
    saved: boolean;
    request_sent: boolean;
    request_received: string | null;
    conversation_id: string | null;
  };
  const urls = await signPaths(d.photos.map((p) => p.path));
  const photos = d.photos.flatMap((p) => (urls.get(p.path) ? [{ id: p.id, url: urls.get(p.path)! }] : []));
  return {
    ...toMemberCard(d.card, photos[0]?.url ?? null),
    availableUntil: d.available_until,
    inPool: d.in_pool,
    photos,
    saved: d.saved,
    requestSent: d.request_sent,
    requestReceived: d.request_received,
    conversationId: d.conversation_id,
  };
}

export type ReceivedRequest = MemberCard & { requestId: string; body: string; createdAt: string };

export async function requestsReceived(viewerId: string): Promise<ReceivedRequest[]> {
  const { data, error } = await createAdminClient().rpc("requests_received", { p_viewer: viewerId });
  if (error) throw new Error("requests unavailable");
  const rows = data ?? [];
  const urls = await signPaths(rows.flatMap((r) => (r.photo_path ? [r.photo_path] : [])));
  return rows.map((r) => ({
    ...toMemberCard(r.card, r.photo_path ? (urls.get(r.photo_path) ?? null) : null),
    requestId: r.request_id,
    body: r.body,
    createdAt: r.created_at,
  }));
}

export async function savedList(viewerId: string): Promise<PoolCard[]> {
  const { data, error } = await createAdminClient().rpc("saved_list", { p_viewer: viewerId });
  if (error) throw new Error("saved list unavailable");
  const rows = data ?? [];
  const urls = await signPaths(rows.flatMap((r) => (r.photo_path ? [r.photo_path] : [])));
  return rows.map((r) => ({
    ...toMemberCard(r.card, r.photo_path ? (urls.get(r.photo_path) ?? null) : null),
    availableUntil: r.available_until,
    saved: true,
  }));
}

/** BR-25: whether the member may send in Casual conversations (server-side, never from the client). */
export async function hasCasualAccess(userId: string): Promise<boolean> {
  const { data } = await createAdminClient().rpc("has_casual_access", { p_user: userId });
  return data === true;
}
