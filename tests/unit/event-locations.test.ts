import { describe, expect, it } from "vitest";
import { canonicalLocations, LocationOptionsSchema, normalizeLocationPatch, publicLocations, resolveLocation, validLocationsForKind, withLocationLocks, type LocationOption } from "../../lib/event-locations";
const hidden: LocationOption = { id: "private", kind: "custom", details: "Private access code 6489", showBeforeBooking: false };
describe("structured meeting locations", () => {
  it("allowlists public fields without hidden host numbers, video links or custom details", () => {
    const options: LocationOption[] = [hidden, { id: "phone", kind: "phone", direction: "invitee_calls", phone: "+1 212 555 0102" }, { id: "video", kind: "video", provider: "zoom", url: "https://example.invalid/private-room" }];
    const serialized = JSON.stringify(publicLocations(options));
    for (const secret of ["6489", "555", "private-room", "showBeforeBooking", "direction"]) expect(serialized).not.toContain(secret);
    expect(publicLocations(options)!.map(option => option.label)).toEqual(["Custom", "Phone call", "Zoom"]);
  });
  it("publishes only explicitly visible custom and in-person details", () => {
    expect(publicLocations([{ ...hidden, showBeforeBooking: true }, { id: "office", kind: "in_person", address: "Room A", notes: "Second floor" }])!.map(option => option.description)).toEqual([hidden.details, "Room A\nSecond floor"]);
  });
  it.each(["javascript:alert(1)", "http://example.invalid/room", "https://user:pass@example.invalid/room", "not a link"])("rejects unsafe meeting URL %s", url => {
    expect(LocationOptionsSchema.safeParse([{ id: "video", kind: "video", provider: "zoom", url }]).success).toBe(false);
  });
  it("rejects duplicate IDs, oversized lists, empty details and invalid host phone numbers", () => {
    for (const options of [[hidden, hidden], Array.from({ length: 11 }, (_, i) => ({ ...hidden, id: `loc-${i}` })), [{ ...hidden, details: " " }], [{ id: "phone", kind: "phone", direction: "invitee_calls", phone: "abc" }]]) expect(LocationOptionsSchema.safeParse(options).success).toBe(false);
  });
  it("requires an explicit valid choice when several locations are available", () => {
    const event = { location: "", locations: [hidden, { ...hidden, id: "other" }] };
    expect(() => resolveLocation(event)).toThrow("location_required"); expect(() => resolveLocation(event, { id: "removed", input: "" })).toThrow("location_changed");
    expect(resolveLocation(event, { id: hidden.id, input: "Untrusted replacement" }).location).toBe(hidden.details);
  });
  it("requires a usable invitee phone, stores it and never substitutes it into host-call directions", () => {
    const option: LocationOption = { id: "phone", kind: "phone", direction: "host_calls", phone: "" };
    expect(() => resolveLocation({ location: "", locations: [option] })).toThrow("location_phone_required");
    expect(() => resolveLocation({ location: "", locations: [option] }, { id: "phone", input: "ext" })).toThrow("location_phone_required");
    expect(resolveLocation({ location: "", locations: [option] }, { id: "phone", input: "+1 212 555 0102" }).locationChoice?.phone).toBe("+1 212 555 0102");
    expect(resolveLocation({ location: "", locations: [{ ...option, direction: "invitee_calls", phone: "+1 212 555 0103" }] }, { id: "phone", input: "+1 212 555 0199" })).toMatchObject({ location: "Phone call: +1 212 555 0103", locationChoice: { phone: "", input: "" } });
  });
  it("requires invitee location and does not store irrelevant supplied answers", () => {
    const event = { location: "", locations: [{ id: "ask", kind: "invitee", prompt: "Where?" } as LocationOption] };
    expect(() => resolveLocation(event)).toThrow("location_input_required"); expect(resolveLocation(event, { id: "ask", input: "Library" }).location).toBe("Library");
    expect(resolveLocation({ location: "", locations: [hidden] }, { id: hidden.id, input: "Do not store" }).locationChoice?.input).toBe("");
  });
  it("preserves legacy values and empty configuration without accepting stale selections", () => {
    expect(resolveLocation({ location: "Old room" })).toEqual({ location: "Old room", locationChoice: null });
    expect(resolveLocation({ location: "Old room", locations: [] })).toEqual({ location: "", locationChoice: null });
    expect(() => resolveLocation({ location: "Old room" }, { id: "old", input: "" })).toThrow("location_changed");
  });
  it("couples structured and legacy field edits without leaking details into the summary", () => {
    const current = { location: "Custom", locations: [hidden] };
    expect(normalizeLocationPatch(current, { locations: [hidden], location: hidden.details })).toEqual(current);
    expect(normalizeLocationPatch(current, { location: "Custom" })).toEqual({ location: "Custom" });
    expect(normalizeLocationPatch(current, { location: "New raw value" })).toEqual({ location: "New raw value", locations: null });
    expect(withLocationLocks(["location"])).toContain("locations"); expect(withLocationLocks(["locations"])).toContain("location");
  });
  it("compares JSONB options independently of key order and restricts shared session choices", () => {
    expect(canonicalLocations([{ showBeforeBooking: false, details: hidden.details, kind: "custom", id: "private" }])).toBe(canonicalLocations([hidden]));
    expect(validLocationsForKind([hidden, { ...hidden, id: "second" }], "collective")).toBe(true);
    expect(validLocationsForKind([hidden, { ...hidden, id: "second" }], "round_robin")).toBe(false);
    expect(validLocationsForKind([{ id: "ask", kind: "invitee", prompt: "Where?" }], "group")).toBe(false);
  });
});
