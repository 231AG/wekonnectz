import "server-only";

import type { NotificationPrefs, NotificationType } from "@/lib/domain/notifications";
import { createAdminClient } from "@/lib/supabase/admin";

/** Notification reads for the signed-in member (the caller passes the session user). */

export type MemberNotification = {
  id: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  createdAt: string;
  read: boolean;
};

export async function memberNotifications(userId: string): Promise<MemberNotification[]> {
  const { data, error } = await createAdminClient().rpc("member_notifications", { p_user: userId, p_limit: 50 });
  if (error) throw new Error("notifications unavailable");
  return (data ?? []).map((n) => ({
    id: n.notification_id,
    type: n.type as NotificationType,
    payload: (n.payload ?? {}) as Record<string, unknown>,
    createdAt: n.created_at,
    read: n.read,
  }));
}

export async function unreadNotifications(userId: string): Promise<number> {
  const { data } = await createAdminClient().rpc("member_unread_notifications", { p_user: userId });
  return data ?? 0;
}

export async function markNotificationsRead(userId: string): Promise<void> {
  await createAdminClient().rpc("member_mark_notifications_read", { p_user: userId });
}

export async function notificationPrefs(userId: string): Promise<NotificationPrefs> {
  const { data, error } = await createAdminClient().rpc("member_notification_prefs", { p_user: userId });
  if (error || !data) throw new Error("prefs unavailable");
  return data as NotificationPrefs;
}

export async function pushDeviceCount(userId: string): Promise<number> {
  const { data } = await createAdminClient().rpc("member_push_device_count", { p_user: userId });
  return data ?? 0;
}
