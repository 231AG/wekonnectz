"use client";

import { useState, type FormEvent } from "react";

/**
 * Server field errors that disappear as soon as the member edits that field, so a corrected field
 * doesn't keep showing an old error. Errors come back on the next submit if still wrong.
 */
export function useFieldErrors(errors: Record<string, string> | undefined) {
  const [edited, setEdited] = useState<{ source: typeof errors; names: Set<string> }>({
    source: errors,
    names: new Set(),
  });
  const names = edited.source === errors ? edited.names : new Set<string>();

  const onEdit = (event: FormEvent<HTMLFormElement>) => {
    const name = (event.target as HTMLInputElement).name;
    if (!name || names.has(name)) return;
    setEdited({ source: errors, names: new Set([...names, name]) });
  };

  const errorFor = (name: string) => (names.has(name) ? undefined : errors?.[name]);
  return { errorFor, onEdit };
}
