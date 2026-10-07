import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type Doc = Database["public"]["Enums"]["consent_document"];

/** The current published version of a legal document (what members see and accept). */
export async function getCurrentDocument(document: Doc) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("legal_documents")
    .select("title, version, body")
    .eq("document", document)
    .eq("is_current", true)
    .maybeSingle();
  return data;
}
