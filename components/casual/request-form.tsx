"use client";

import { useActionState, useState } from "react";
import { Send } from "lucide-react";

import { FormError } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { RequestFormState } from "@/lib/casual/actions";

type Send = (prev: RequestFormState, formData: FormData) => Promise<RequestFormState>;

/** Send a request (§14 Casual): text only, up to 300 characters, no contact details or prices. */
function RequestForm({ recipientId, name, send }: { recipientId: string; name: string; send: Send }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [state, action, pending] = useActionState(send, {});

  if (state.sent) {
    return (
      <p role="status" className="rounded-control bg-surface-2 p-4 text-center text-[15px]">
        Request sent. {name} will see it in their requests.
      </p>
    );
  }
  return (
    <>
      <Button variant="casual" onClick={() => setOpen(true)}>
        <Send className="size-5" strokeWidth={1.8} aria-hidden /> Send a request
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title={`Send ${name} a request`} description="Say hello. Text only.">
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="recipientId" value={recipientId} />
          <label htmlFor="request-body" className="sr-only">
            Your message
          </label>
          <Textarea
            id="request-body"
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={300}
            rows={4}
            required
            aria-describedby="request-help"
            placeholder={`Hi ${name}…`}
          />
          <p id="request-help" className="flex justify-between text-[13px] text-muted-foreground">
            <span>No phone numbers, links, handles or prices.</span>
            <span aria-live="polite">{body.length}/300</span>
          </p>
          {state.error ? <FormError>{state.error}</FormError> : null}
          <Button type="submit" variant="casual" disabled={pending || body.trim().length === 0}>
            {pending ? "Sending…" : "Send request"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

export { RequestForm };
