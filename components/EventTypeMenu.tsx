"use client";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { I } from "@/components/app/icons";

export type EventTypeAction = "edit" | "duplicate" | "toggle" | "visibility" | "delete";
export function EventTypeMenu({ title, active, secret, managed, shared = false, canDelete = true, busy, bookingUrl, embedUrl, onAction }: {
  shared?: boolean; canDelete?: boolean; title: string; active: boolean; secret: boolean; managed: boolean; busy: boolean; bookingUrl: string; embedUrl: string;
  onAction(action: EventTypeAction): void;
}) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ top: 0, left: 0 });
  const lastFirst = useRef(false);
  const restoreAfterVisibility = useRef(false);
  useEffect(() => {
    if (busy || !restoreAfterVisibility.current) return;
    restoreAfterVisibility.current = false;
    // Disabling the trigger during a save can move native focus to the body.
    if (document.activeElement === document.body) trigger.current?.focus();
  }, [busy]);
  const close = useCallback((restoreFocus = true) => {
    if (menu.current?.matches(":popover-open")) menu.current.hidePopover();
    if (restoreFocus) trigger.current?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    const moved = (event: Event) => {
      if (event.type === "scroll" && event.target instanceof Node && menu.current?.contains(event.target)) return;
      close(!!menu.current?.contains(document.activeElement));
    };
    document.addEventListener("scroll", moved, true);
    window.addEventListener("resize", moved);
    return () => { document.removeEventListener("scroll", moved, true); window.removeEventListener("resize", moved); };
  }, [open, close]);
  const items = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"]') ?? [])];
  function place() {
    const rect = trigger.current?.getBoundingClientRect(); if (!rect) return;
    const height = menu.current?.offsetHeight || 260;
    const top = rect.bottom + 6 + height <= window.innerHeight - 12 ? rect.bottom + 6 : Math.max(12, rect.top - height - 6);
    setPosition({ top, left: Math.max(12, Math.min(rect.right - 224, window.innerWidth - 236)) });
  }
  function keys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
    // Let native Tab navigation continue from the trigger, outside the closed menu.
    if (event.key === "Tab") { close(); return; }
    const options = items(), index = options.indexOf(document.activeElement as HTMLElement);
    if (event.key === " " && document.activeElement instanceof HTMLAnchorElement) {
      event.preventDefault(); document.activeElement.click(); return;
    }
    let next: number;
    if (event.key === "ArrowDown") next = (index + 1) % options.length;
    else if (event.key === "ArrowUp") next = (index - 1 + options.length) % options.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = options.length - 1;
    else return;
    event.preventDefault(); options[next]?.focus();
  }
  const action = (name: EventTypeAction) => { restoreAfterVisibility.current = name === "visibility"; close(); onAction(name); };
  return <div className="cs-et-menu" onClick={event => event.stopPropagation()} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) close(false);
  }}>
    <button ref={trigger} type="button" className="cs-ibtn" disabled={busy} popoverTarget={id}
      aria-label={`More options for ${title}`} aria-haspopup="menu" aria-expanded={open} aria-controls={id}
      onKeyDown={event => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault(); lastFirst.current = event.key === "ArrowUp"; menu.current?.showPopover();
      }}>{I.dots(20)}</button>
    <div ref={menu} id={id} popover="auto" role="menu" aria-label={`Options for ${title}`} className="cs-menu cs-event-menu" style={position}
      onBeforeToggle={event => { if (event.newState === "open") place(); }}
      onToggle={event => {
        setOpen(event.newState === "open");
        if (event.newState === "open") { place(); const options = items(); options[lastFirst.current ? options.length - 1 : 0]?.focus(); lastFirst.current = false; }
      }} onKeyDown={keys}>
      <a role="menuitem" tabIndex={-1} href={bookingUrl} target="_blank" rel="noopener noreferrer" onClick={() => close()}>View booking page</a>
      <button role="menuitem" tabIndex={-1} onClick={() => action("edit")}>Edit</button>
      <Link role="menuitem" tabIndex={-1} href={embedUrl} onClick={() => close()}>Add to website</Link>
      {!shared && <button role="menuitem" tabIndex={-1} onClick={() => action("visibility")}>{secret ? "Make public" : "Make secret"}</button>}
      <button role="menuitem" tabIndex={-1} onClick={() => action("duplicate")}>Duplicate</button>
      {!managed && canDelete && <button role="menuitem" tabIndex={-1} className="cs-menu-danger" onClick={() => action("delete")}>Delete</button>}
      <button role="menuitemcheckbox" aria-checked={active} tabIndex={-1} onClick={() => action("toggle")}>
        {active ? "Turn off" : "Turn on"}<span aria-hidden="true">{active ? "On" : "Off"}</span>
      </button>
    </div>
  </div>;
}
