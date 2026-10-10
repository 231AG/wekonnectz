"use client";

import { useState } from "react";
import { Ban } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Accept · Decline · Block for one request (member mock-up 05). Blocking asks first (§17). */
function RequestActions({
  requestId,
  name,
  respond,
}: {
  requestId: string;
  name: string;
  respond: (formData: FormData) => Promise<void>;
}) {
  const [confirmBlock, setConfirmBlock] = useState(false);
  return (
    <form action={respond} className="flex flex-col gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      {confirmBlock ? (
        <div role="alertdialog" aria-label={`Block ${name}?`} className="flex flex-col gap-2">
          <p className="text-[15px]">Block {name}? You won’t see each other anywhere. They won’t be told.</p>
          <div className="flex gap-2">
            <Button
              type="submit"
              name="action"
              value="BLOCK"
              variant="outline"
              size="md"
              className="flex-1 text-danger"
            >
              Block
            </Button>
            <Button type="button" variant="ghost" size="md" className="flex-1" onClick={() => setConfirmBlock(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button type="submit" name="action" value="ACCEPT" variant="casual" size="md" className="flex-[1.4]">
            Accept
          </Button>
          <Button type="submit" name="action" value="DECLINE" variant="outline" size="md" className="flex-1">
            Decline
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Block ${name}`}
            onClick={() => setConfirmBlock(true)}
          >
            <Ban className="size-5 text-danger" strokeWidth={1.8} aria-hidden />
          </Button>
        </div>
      )}
    </form>
  );
}

export { RequestActions };
