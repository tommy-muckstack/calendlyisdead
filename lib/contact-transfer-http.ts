import { NextResponse } from "next/server";
import { ContactTransferError } from "./contact-transfer";
import { ContactListError } from "./contact-query";
export async function transferBody(request: Request, limit: number): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > limit) throw new ContactTransferError("The request is too large.", 413);
  const reader = request.body?.getReader(); if (!reader) return null;
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new ContactTransferError("The request is too large.", 413); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return null; }
}
export function transferFailure(error: unknown) {
  const known = error instanceof ContactTransferError || error instanceof ContactListError;
  return NextResponse.json({ error: known ? error.message : "The operation could not be confirmed. Try again." }, { status: known ? error.status : 500, headers: { "Cache-Control": "private, no-store" } });
}
