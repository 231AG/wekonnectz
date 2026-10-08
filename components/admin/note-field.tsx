"use client";

import { useState } from "react";

import { Textarea } from "@/components/ui/textarea";

/** Internal note box that keeps its text if saving fails (React resets uncontrolled forms). */
function NoteField() {
  const [note, setNote] = useState("");
  return (
    <>
      <label htmlFor="note" className="text-[13px] font-semibold text-muted-foreground">
        Internal note
      </label>
      <Textarea
        id="note"
        name="note"
        maxLength={2000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What you checked and why"
        className="min-h-20"
      />
    </>
  );
}

export { NoteField };
