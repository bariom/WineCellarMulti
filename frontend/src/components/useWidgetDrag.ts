import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { PersonalDashboardWidgetId } from "../types";

type Drag = { id: PersonalDashboardWidgetId; over: PersonalDashboardWidgetId | null; x: number; y: number };

// Reorder only on release: widget contents keep their state and drop targets stay stable.
export function useWidgetDrag(enabled: boolean, onDrop: (from: PersonalDashboardWidgetId, to: PersonalDashboardWidgetId) => void) {
  const gridRef = useRef<HTMLDivElement>(null);
  const pending = useRef<{ id: PersonalDashboardWidgetId; pointer: number; x: number; y: number; handle: HTMLButtonElement } | null>(null);
  const active = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  function cancel() {
    const session = pending.current;
    pending.current = null;
    active.current = null;
    setDrag(null);
    if (session?.handle.hasPointerCapture(session.pointer)) session.handle.releasePointerCapture(session.pointer);
  }

  function update(x: number, y: number) {
    if (!pending.current) return;
    const target = [...(gridRef.current?.querySelectorAll<HTMLElement>("[data-widget-id]") ?? [])].find(element => {
      const box = element.getBoundingClientRect();
      return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    });
    const next: Drag = { id: pending.current.id, over: target?.dataset.widgetId as PersonalDashboardWidgetId ?? null, x, y };
    active.current = next;
    setDrag(next);
  }

  useEffect(() => {
    if (!enabled) cancel();
  }, [enabled]);

  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    let frame: number;
    let lastTime = 0;
    function scroll(time: number) {
      const point = active.current;
      if (!point) return;
      // Leave room for the fixed mobile navigation and header.
      const edge = 110;
      const speed = point.y < edge ? -Math.min(1, (edge - point.y) / edge)
        : point.y > innerHeight - edge ? Math.min(1, (point.y - innerHeight + edge) / edge) : 0;
      if (speed) {
        window.scrollBy(0, speed * Math.min(time - (lastTime || time), 32) * 0.7);
        update(point.x, point.y);
      }
      lastTime = time;
      frame = requestAnimationFrame(scroll);
    }
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); cancel(); } };
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", cancel);
    frame = requestAnimationFrame(scroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("blur", cancel);
    };
  }, [dragging]);

  return { gridRef, drag, handleProps: (id: PersonalDashboardWidgetId) => ({
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      if (!enabled || !event.isPrimary || event.button !== 0) return;
      pending.current = { id, pointer: event.pointerId, x: event.clientX, y: event.clientY, handle: event.currentTarget };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event: PointerEvent<HTMLButtonElement>) {
      const session = pending.current;
      if (!session || session.pointer !== event.pointerId) return;
      if (!active.current && Math.hypot(event.clientX - session.x, event.clientY - session.y) < 6) return;
      event.preventDefault();
      update(event.clientX, event.clientY);
    },
    onPointerUp(event: PointerEvent<HTMLButtonElement>) {
      if (pending.current?.pointer !== event.pointerId) return;
      const result = active.current;
      if (result?.over && result.id !== result.over && enabled) onDrop(result.id, result.over);
      cancel();
    },
    onPointerCancel: cancel,
    onLostPointerCapture: cancel,
  }) };
}
