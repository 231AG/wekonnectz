import "server-only";

import { signPaths } from "@/lib/storage/photos";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Relationship mode and conversations (spec §14, §15). The database functions decide who may see whom
 * (eligibility, blocks, matches); storage paths stay here and only signed URLs leave the server (BR-11).
 */

export type MemberCard = {
  userId: string;
  displayName: string;
  age: number;
  area: string | null;
  bio: string | null;
  verified: boolean;
  interests: string[];
  photoUrl: string | null;
};

type RawCard = {
  user_id: string;
  display_name: string;
  age: number;
  area: string | null;
  bio: string | null;
  verified: boolean;
  interests: string[];
};

export function toMemberCard(raw: unknown, url: string | null): MemberCard {
  const c = raw as RawCard;
  return {
    userId: c.user_id,
    displayName: c.display_name,
    age: Number(c.age),
    area: c.area,
    bio: c.bio,
    verified: c.verified === true,
    interests: Array.isArray(c.interests) ? c.interests : [],
    photoUrl: url,
  };
}

async function withPhotos<T extends { photo_path: string | null }>(rows: T[]) {
  const urls = await signPaths(rows.flatMap((r) => (r.photo_path ? [r.photo_path] : [])));
  return (r: T) => (r.photo_path ? (urls.get(r.photo_path) ?? null) : null);
}

export type DiscoverFilters = { areaId?: string; minAge?: number; maxAge?: number; interestIds?: string[] };

export async function discoverNext(
  viewerId: string,
  f: DiscoverFilters,
): Promise<{ card: MemberCard | null } | { error: "NOT_ELIGIBLE" }> {
  const { data, error } = await createAdminClient().rpc("discover_candidates", {
    p_viewer: viewerId,
    p_area_id: f.areaId,
    p_min_age: f.minAge,
    p_max_age: f.maxAge,
    p_interest_ids: f.interestIds?.length ? f.interestIds : undefined,
    p_limit: 1,
  });
  if (error) {
    if (error.message.includes("NOT_ELIGIBLE")) return { error: "NOT_ELIGIBLE" };
    throw new Error("discover unavailable");
  }
  const rows = data ?? [];
  const url = await withPhotos(rows);
  return { card: rows[0] ? toMemberCard(rows[0].card, url(rows[0])) : null };
}

export async function likesReceived(viewerId: string): Promise<(MemberCard & { likedAt: string })[] | null> {
  const { data, error } = await createAdminClient().rpc("likes_received", { p_viewer: viewerId });
  if (error) {
    if (error.message.includes("NOT_ELIGIBLE")) return null;
    throw new Error("likes unavailable");
  }
  const rows = data ?? [];
  const url = await withPhotos(rows);
  return rows.map((r) => ({ ...toMemberCard(r.card, url(r)), likedAt: r.liked_at }));
}

export async function matchesList(viewerId: string) {
  const { data, error } = await createAdminClient().rpc("matches_list", { p_viewer: viewerId });
  if (error) throw new Error("matches unavailable");
  const rows = data ?? [];
  const url = await withPhotos(rows);
  return rows.map((r) => ({
    matchId: r.match_id,
    conversationId: r.conversation_id,
    matchedAt: r.matched_at,
    hasMessages: r.has_messages,
    ...toMemberCard(r.card, url(r)),
  }));
}

export async function conversationsList(viewerId: string) {
  const { data, error } = await createAdminClient().rpc("conversations_list", { p_viewer: viewerId });
  if (error) throw new Error("conversations unavailable");
  const rows = data ?? [];
  const url = await withPhotos(rows);
  return rows.map((r) => ({
    conversationId: r.conversation_id,
    type: r.type,
    lastBody: r.last_body,
    lastMine: r.last_mine,
    lastMessageAt: r.last_message_at,
    unread: Number(r.unread),
    ...toMemberCard(r.card, url(r)),
  }));
}

export type ChatMessage = { id: string; mine: boolean; body: string; createdAt: string; readAt: string | null };

export type ConversationView = {
  conversationId: string;
  type: "RELATIONSHIP" | "CASUAL";
  matchId: string | null;
  other: MemberCard;
  canSend: boolean;
  messages: ChatMessage[];
};

export async function conversationView(viewerId: string, conversationId: string): Promise<ConversationView | null> {
  const { data, error } = await createAdminClient().rpc("conversation_view", {
    p_viewer: viewerId,
    p_conversation: conversationId,
  });
  if (error || !data) return null;
  const v = data as {
    conversation_id: string;
    type: "RELATIONSHIP" | "CASUAL";
    match_id: string | null;
    other: RawCard;
    photo_path: string | null;
    can_send: boolean;
    messages: { id: string; mine: boolean; body: string; created_at: string; read_at: string | null }[];
  };
  const photoUrl = v.photo_path ? ((await signPaths([v.photo_path])).get(v.photo_path) ?? null) : null;
  return {
    conversationId: v.conversation_id,
    type: v.type,
    matchId: v.match_id,
    other: toMemberCard(v.other, photoUrl),
    canSend: v.can_send,
    messages: v.messages.map((m) => ({
      id: m.id,
      mine: m.mine,
      body: m.body,
      createdAt: m.created_at,
      readAt: m.read_at,
    })),
  };
}

export type RelationshipSummary = {
  eligible: boolean;
  intentRelationship: boolean;
  likesReceived: number;
  newMatches: number;
  unread: number;
};

export async function relationshipSummary(viewerId: string): Promise<RelationshipSummary> {
  const { data, error } = await createAdminClient().rpc("relationship_summary", { p_viewer: viewerId });
  if (error || !data) throw new Error("summary unavailable");
  const d = data as Record<string, unknown>;
  return {
    eligible: d.eligible === true,
    intentRelationship: d.intent_relationship === true,
    likesReceived: Number(d.likes_received ?? 0),
    newMatches: Number(d.new_matches ?? 0),
    unread: Number(d.unread ?? 0),
  };
}
