import { NextResponse } from "next/server";
import { ContactAutomationError } from "./contact-automation-store";
import { OpportunityError } from "./opportunities";
import { ContactTransferError } from "./contact-transfer";
export const privateResponse = { headers: { "Cache-Control": "private, no-store" } };
export const opportunityUnauthorized = () => NextResponse.json({ error: "Sign in to manage opportunities." }, { status: 401, ...privateResponse });
export function opportunityFailure(error: unknown) {
  const known = error instanceof OpportunityError || error instanceof ContactAutomationError || error instanceof ContactTransferError;
  return NextResponse.json({ error: known ? error.message : "The change could not be confirmed. Try again." }, { status: known ? error.status : 500, ...privateResponse });
}
