"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { SendHorizontal, ShieldCheck } from "lucide-react";

import { FormError } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";
import type { SendResult } from "@/lib/messages/actions";
import type { ChatMessage } from "@/lib/storage/relationship";
import { browserClient } from "@/lib/supabase/browser";
import { MESSAGE_MAX_LENGTH } from "@/lib/validation/messages";
import { cn } from "@/lib/utils";

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * Live conversation (member mock-up 06; spec §14). New messages and read receipts arrive over the
 * conversation's private Realtime channel, which the database lets only its members join.
 */
function ConversationLive({
  conversationId,
  meId,
  initial,
  canSend,
  cannotSendReason,
  send,
  markRead,
}: {
  conversationId: string;
  meId: string;
  initial: ChatMessage[];
  canSend: boolean;
  cannotSendReason: string;
  send: (conversationId: string, body: string) => Promise<SendResult>;
  markRead: (conversationId: string) => Promise<void>;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  const [live, setLive] = useState(false);
  const [sending, startSending] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);

  const add = useCallback((m: ChatMessage) => {
    setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
  }, []);

  useEffect(() => {
    void markRead(conversationId);
    const supabase = browserClient();
    let cancelled = false;
    const channel = supabase.channel(`conversation:${conversationId}`, { config: { private: true } });
    channel
      .on("broadcast", { event: "message" }, ({ payload }) => {
        const p = payload as { id: string; sender_id: string; body: string; created_at: string };
        add({ id: p.id, mine: p.sender_id === meId, body: p.body, createdAt: p.created_at, readAt: null });
        if (p.sender_id !== meId) void markRead(conversationId);
      })
      .on("broadcast", { event: "read" }, ({ payload }) => {
        const p = payload as { reader_id: string; read_at: string };
        if (p.reader_id === meId) return;
        setMessages((list) => list.map((m) => (m.mine && !m.readAt ? { ...m, readAt: p.read_at } : m)));
      });
    // Realtime needs the member's access token for a private channel.
    void supabase.realtime.setAuth().then(() => {
      if (cancelled) return;
      channel.subscribe((status) => setLive(status === "SUBSCRIBED"));
    });
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [conversationId, meId, add, markRead]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    startSending(async () => {
      setError(undefined);
      const result = await send(conversationId, body);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.message) add(result.message);
      setDraft("");
    });
  }

  const lastMine = [...messages].reverse().find((m) => m.mine);

  return (
    <>
      {/* §17: in-chat safety reminder at the start of every conversation. */}
      <p className="flex items-start gap-3 rounded-card border border-pending/40 bg-pending/10 px-4 py-3 text-[15px]">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-pending" strokeWidth={1.8} aria-hidden />
        Meet in public, tell a friend, and never send money to someone you haven’t met.
      </p>

      <ol aria-label="Messages" aria-live="polite" className="flex flex-1 flex-col justify-end gap-3" data-live={live}>
        {messages.length === 0 ? (
          <li className="text-center text-sm text-muted-foreground">Say hello — you matched!</li>
        ) : null}
        {messages.map((m) => (
          <li
            key={m.id}
            className={cn("flex max-w-[82%] flex-col gap-1", m.mine ? "items-end self-end" : "items-start")}
          >
            <p
              className={cn(
                "rounded-3xl px-5 py-3 text-[16px] leading-6 break-words whitespace-pre-wrap",
                m.mine ? "bg-pending text-on-accent" : "bg-surface-2",
              )}
            >
              <span className="sr-only">{m.mine ? "You: " : "Them: "}</span>
              {m.body}
            </p>
            <span className="text-xs text-muted-foreground">
              {time(m.createdAt)}
              {m === lastMine && m.readAt ? " · Seen" : ""}
            </span>
          </li>
        ))}
      </ol>
      <div ref={bottom} />

      <div className="sticky bottom-0 -mx-5 flex flex-col gap-2 bg-background px-5 pt-2 pb-4">
        <FormError>{error}</FormError>
        {canSend ? (
          <form onSubmit={submit} className="flex items-end gap-3">
            <label htmlFor="message" className="sr-only">
              Message
            </label>
            <textarea
              id="message"
              rows={1}
              value={draft}
              maxLength={MESSAGE_MAX_LENGTH}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Write a message…"
              className="max-h-32 min-h-[52px] flex-1 resize-none rounded-[26px] border-[1.5px] border-border bg-surface-1 px-5 py-3.5 text-base"
            />
            <Button
              type="submit"
              size="icon"
              aria-label="Send"
              disabled={sending || !draft.trim()}
              className="size-[52px] bg-pending text-on-accent hover:opacity-90"
            >
              <SendHorizontal className="size-5" strokeWidth={1.8} aria-hidden />
            </Button>
          </form>
        ) : (
          <p role="status" className="rounded-control bg-surface-1 px-4 py-3 text-center text-sm text-muted-foreground">
            {cannotSendReason}
          </p>
        )}
      </div>
    </>
  );
}

export { ConversationLive };
