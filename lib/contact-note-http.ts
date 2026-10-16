import { NextResponse } from "next/server";
import { ContactNoteError } from "./contact-notes";
export function noteFailure(error: unknown) { return NextResponse.json({ error: error instanceof ContactNoteError ? error.code : "save_failed" }, { status: error instanceof ContactNoteError ? error.status : 500, headers: { "Cache-Control": "private, no-store" } }); }
export async function noteBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > 70000) return null;
  const reader = request.body?.getReader(); if (!reader) return null; const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 70000) { await reader.cancel(); return null; } chunks.push(value); } }
  finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return null; }
}
