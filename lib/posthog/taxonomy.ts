// Analytics taxonomy for the shared IsDead PostHog project 666931 (contract: yourappisdead/ANALYTICS.md, see docs/ANALYTICS.md).
// Super properties: product (this app's slug), surface ("landing" = logged-out marketing pages, "app" = the working product
// and anything it publishes), platform ("web"). Page views are PostHog's built-in $pageview.
// Events are `app_<object>_<action>` (or `landing_<object>_<action>` for marketing CTAs); the product name lives in
// `product`, never in an event name. Never send user content (titles, URLs, emails, names, answers, notes) as properties.
// (Lives in lib/posthog, not lib/analytics: lib/analytics.ts is the product's own scheduling-analytics module.)
export const APP = "calendlyisdead" as const;
export type Surface = "landing" | "app";
export const EVENTS = {
  // ---- account ----
  app_signed_up: "app_signed_up",       // method ("password")
  app_signed_in: "app_signed_in",       // method ("password" | "google")
  app_signed_out: "app_signed_out",
  // ---- host: event types and links ----
  app_event_type_created: "app_event_type_created",
  app_event_type_deleted: "app_event_type_deleted",
  app_one_off_created: "app_one_off_created",       // duration_min
  app_poll_created: "app_poll_created",             // options (count), duration_min
  app_poll_booked: "app_poll_booked",               // host picked the winning option
  app_shared: "app_shared",                         // object ("event_type" | "one_off"), method ("clipboard")
  // ---- invitees (public pages) ----
  app_booking_created: "app_booking_created",       // rescheduled, paid, embed (bools), guests (count)
  app_booking_cancelled: "app_booking_cancelled",   // has_reason (bool)
  app_poll_voted: "app_poll_voted",                 // options (count chosen)
  app_routing_form_submitted: "app_routing_form_submitted", // routed ("redirect" | "message")
} as const;
export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
export const EVENT_PREFIXES = ["app_", "landing_"] as const;
/** Super properties every event carries (yourappisdead/ANALYTICS.md §1). */
export const superProps = (surface: Surface) => ({ product: APP, surface, platform: "web" as const });
/** Super properties older IsDead taxonomies persisted in the shared yourappisdead.com cookie. Unregistered at boot. */
export const LEGACY_PROPS = ["app", "app_family", "base_path", "suite_id", "app_id", "schema_version", "source", "site_id", "environment"] as const;
