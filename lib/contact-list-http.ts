import { NextResponse } from "next/server";
import { ContactTransferError } from "./contact-transfer";
import { contactListFailure } from "./contact-lists";
export function listFailure(error: unknown) {
  const failure = error instanceof ContactTransferError ? { error: error.message, status: error.status } : contactListFailure(error);
  return NextResponse.json({ error: failure.error }, { status: failure.status, headers: { "Cache-Control": "private, no-store" } });
}
