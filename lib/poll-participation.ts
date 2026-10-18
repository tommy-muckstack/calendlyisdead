import { z } from "zod";
import { PollInvitee } from "./poll-booking-contract";

export const PollCreateInput = z.object({ title: z.string().trim().min(1).max(120), durationMin: z.number().int().min(5).max(720),
  location: z.string().trim().max(300).default(""), options: z.array(z.string().datetime({ offset: true })).min(2).max(40), showVotes: z.boolean().default(false) });
export const PollVoteInput = PollInvitee.extend({ picks: z.array(z.string().datetime({ offset: true })).min(1).max(40) });
export const PollVisibilityInput = z.object({ showVotes: z.boolean() }).strict();
export function pollStatus(poll: { status: string; options: string[] }, now = Date.now()) {
  return poll.status === "open" && !poll.options.some(option => Date.parse(option) > now) ? "expired" : poll.status;
}
export const pollParticipationError = (code: string) => ({
  already_voted: "A vote has already been submitted for this email. Submitted votes cannot be changed.",
  closed: "This poll is closed and no longer accepts votes.",
  full: "This poll has reached its limit of 40 participants.",
  invalid: "Check your name, email and selected times.",
  invalid_options: "Choose between 2 and 40 future times.",
  bad_option: "A selected time is no longer available. Refresh the poll and choose again.",
  not_found: "This poll is no longer available.",
  unauthorized: "Sign in again to update this poll.",
}[code] ?? "We couldn’t save your changes. Please try again.");
