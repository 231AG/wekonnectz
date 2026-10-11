/**
 * What each notification says and where it leads (spec §16, §20). The same words are used in the app
 * and in web push. They never name another member or quote a message: a lock screen can be seen by
 * anyone holding the phone.
 */

export type NotificationType =
  | "VERIFICATION_APPROVED"
  | "VERIFICATION_REJECTED"
  | "PHOTO_REJECTED"
  | "ACCOUNT_ACTIVE"
  | "PAYMENT_APPROVED"
  | "PAYMENT_REJECTED"
  | "PAYMENT_NEEDS_INFO"
  | "REQUEST_RECEIVED"
  | "REQUEST_ACCEPTED"
  | "MATCH_CREATED"
  | "MESSAGE_RECEIVED"
  | "PASS_EXPIRING"
  | "CARD_RENEWAL_REMINDER";

export type NotificationTone = "casual" | "relationship" | "account" | "warning";

export type NotificationText = { title: string; body: string; href: string; tone: NotificationTone };

type Payload = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);

/** "Mon 12 Oct, 11:00 PM" in Liberia time (GMT). */
export function formatNoticeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    timeZone: "Africa/Monrovia",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function describeNotification(type: NotificationType | string, payload: Payload = {}): NotificationText {
  switch (type) {
    case "REQUEST_RECEIVED":
      return {
        title: "New message request",
        body: "Someone in Available Now sent you a request.",
        href: "/messages/requests",
        tone: "casual",
      };
    case "REQUEST_ACCEPTED": {
      const conversation = id(payload.conversation_id);
      return {
        title: "Request accepted",
        body: "Your request was accepted. Say hello.",
        href: conversation ? `/messages/${conversation}` : "/messages",
        tone: "casual",
      };
    }
    case "MATCH_CREATED":
      return {
        title: "It’s a match",
        body: "You both liked each other. Start the conversation.",
        href: "/relationship/matches",
        tone: "relationship",
      };
    case "MESSAGE_RECEIVED": {
      const conversation = id(payload.conversation_id);
      const count = typeof payload.count === "number" && payload.count > 1 ? payload.count : 1;
      return {
        title: count > 1 ? `${count} new messages` : "New message",
        body: "Open the chat to read it.",
        href: conversation ? `/messages/${conversation}` : "/messages",
        tone: "relationship",
      };
    }
    case "PASS_EXPIRING": {
      const ends = typeof payload.ends_at === "string" ? formatNoticeTime(payload.ends_at) : "";
      return {
        title: "Your Casual pass ends soon",
        body: ends ? `Access ends ${ends}. Get another pass to keep chatting.` : "Get another pass to keep chatting.",
        href: "/casual/get-access",
        tone: "warning",
      };
    }
    case "CARD_RENEWAL_REMINDER": {
      const renews = typeof payload.renews_at === "string" ? formatNoticeTime(payload.renews_at) : "";
      return {
        title: "Your card plan renews soon",
        body: renews
          ? `It renews ${renews}. You can cancel any time before then.`
          : "You can cancel any time before it renews.",
        href: "/me/payments",
        tone: "account",
      };
    }
    case "VERIFICATION_APPROVED":
      return {
        title: "You’re verified",
        body: "Your selfie was approved.",
        href: "/account/verification",
        tone: "account",
      };
    case "VERIFICATION_REJECTED":
      return {
        title: "Selfie not approved",
        body: "Please take a new verification selfie.",
        href: "/account/verification",
        tone: "warning",
      };
    case "PHOTO_REJECTED":
      return {
        title: "A photo wasn’t approved",
        body: "Replace it so your profile stays complete.",
        href: "/onboarding/photos",
        tone: "warning",
      };
    case "ACCOUNT_ACTIVE":
      return { title: "Your profile is live", body: "Welcome to WeKonnectz.", href: "/home", tone: "account" };
    case "PAYMENT_APPROVED":
      return { title: "Payment approved", body: "Your Casual pass is active.", href: "/casual", tone: "casual" };
    case "PAYMENT_REJECTED":
      return {
        title: "Payment not approved",
        body: "We couldn’t verify your payment. See the details.",
        href: "/me/payments",
        tone: "warning",
      };
    case "PAYMENT_NEEDS_INFO":
      return {
        title: "We need more information",
        body: "Answer our question about your payment.",
        href: "/me/payments",
        tone: "warning",
      };
    default:
      return { title: "Update", body: "Open WeKonnectz to see what’s new.", href: "/home", tone: "account" };
  }
}

export const PREF_CATEGORIES = [
  { key: "requests", label: "Message requests", detail: "New requests, and when yours are accepted" },
  { key: "matches", label: "Matches", detail: "When you and someone like each other" },
  { key: "messages", label: "Messages", detail: "New messages in your chats" },
  { key: "reminders", label: "Reminders", detail: "Before a pass ends or a card plan renews" },
] as const;

export type PrefKey = (typeof PREF_CATEGORIES)[number]["key"];
export type NotificationPrefs = Record<PrefKey, boolean>;
