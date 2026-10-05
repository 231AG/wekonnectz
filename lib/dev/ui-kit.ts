import "server-only";
import { notFound } from "next/navigation";
import { connection } from "next/server";

/** The UI kit preview is a development aid. It 404s unless ENABLE_UI_KIT=1 at request time. */
export async function assertUiKitEnabled() {
  await connection();
  if (process.env.ENABLE_UI_KIT !== "1") notFound();
}
