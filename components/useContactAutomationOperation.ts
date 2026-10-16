"use client";
import { useEffect, useRef, useState } from "react";
export class AutomationResponseError extends Error { constructor(message: string, public status: number) { super(message); } }
export function useAutomationOperation() {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [conflict, setConflict] = useState(false);
  const pending = useRef(false), active = useRef(false), abort = useRef<AbortController | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; abort.current?.abort(); }; }, []);
  async function run<T>(action: (signal: AbortSignal) => Promise<T>): Promise<{ value: T } | null> {
    if (pending.current) return null; pending.current = true; setBusy(true); setError("");
    const controller = new AbortController(); abort.current = controller; const timeout = setTimeout(() => controller.abort(), 15000);
    try { const value = await action(controller.signal); if (!active.current) return null; setConflict(false); return { value }; }
    catch (cause) { if (active.current) { setError(cause instanceof AutomationResponseError ? cause.message : "The change could not be confirmed. Your choices are still here. Try again."); setConflict(cause instanceof AutomationResponseError && cause.status === 409); } return null; }
    finally { clearTimeout(timeout); pending.current = false; if (active.current) setBusy(false); }
  }
  return { busy, error, conflict, pending, setError, run };
}
