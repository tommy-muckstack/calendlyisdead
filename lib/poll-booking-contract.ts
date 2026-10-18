import { z } from "zod";

export const PollInvitee = z.object({ name: z.string().trim().min(1).max(200), email: z.string().trim().toLowerCase().email().max(320) });
export const PollReviewInput = z.object({ option: z.string().datetime({ offset: true }), extraInvitees: z.array(PollInvitee).max(40).default([]) });
export const PollBookInput = PollReviewInput.extend({ reviewKey: z.string().regex(/^[a-f0-9]{64}$/) });
export type PollInviteeInput = z.infer<typeof PollInvitee>;
export const PollBookingReviewData = z.object({
  pollId: z.string(), title: z.string(), location: z.string(), durationMin: z.number().int().positive(),
  start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }),
  invitees: z.array(PollInvitee).min(1).max(40), externalConflict: z.boolean(), reviewKey: z.string().regex(/^[a-f0-9]{64}$/),
});
export type PollBookingReview = z.infer<typeof PollBookingReviewData>;

export const pollBookingError = (code: string) => ({
  booking_unconfirmed: "We couldn’t confirm the booking. Check the poll for a booking before trying again.",
  calendar_unavailable: "Your connected calendar could not be checked. Try again or reconnect it in Calendar settings.",
  slot_unavailable: "This time overlaps a scheduled meeting or exceeds your meeting limits. Choose another time.",
  review_changed: "The meeting details, invitees or calendar conflicts have changed. Review them again before booking.",
  review_required: "Review the meeting details before booking.",
  no_votes: "Add an invitee or choose a time with votes.",
  too_many_invitees: "A meeting poll supports up to 40 invitees.",
  bad_option: "This time is no longer available in the poll. Choose another time.",
  closed: "This poll has already closed. Refresh the page to see its booking.",
  not_found: "This poll is no longer available.",
  invalid: "Check the invitee names and email addresses.",
}[code] ?? "We couldn’t check this meeting. Try again.");
