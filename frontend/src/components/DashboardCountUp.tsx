import { useEffect, useRef, useState } from "react";

type DashboardCountUpProps = {
  value: number;
  format: (value: number) => string;
  duration?: number;
  delay?: number;
};

/**
 * Animates a dashboard metric once, when the metric becomes visible.
 * It deliberately leaves the final value visible until that moment, so a
 * delayed render or a browser without IntersectionObserver never shows a
 * misleading zero.
 */
export function DashboardCountUp({ value, format, duration = 760, delay = 0 }: DashboardCountUpProps) {
  const elementRef = useRef<HTMLOutputElement | null>(null);
  const formatRef = useRef(format);
  const frameRef = useRef(0);
  const [displayValue, setDisplayValue] = useState(value);

  formatRef.current = format;

  useEffect(() => {
    const element = elementRef.current;
    const target = Number.isFinite(value) ? value : 0;
    if (!element || target === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      setDisplayValue(target);
      return;
    }

    let started = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || started) return;
      started = true;
      observer.disconnect();
      setDisplayValue(0);
      const startAt = performance.now() + delay;
      const tick = (now: number) => {
        const progress = Math.max(0, Math.min((now - startAt) / duration, 1));
        const eased = 1 - (1 - progress) ** 3;
        setDisplayValue(target * eased);
        if (progress < 1) frameRef.current = window.requestAnimationFrame(tick);
      };
      frameRef.current = window.requestAnimationFrame(tick);
    }, { threshold: 0.45 });
    observer.observe(element);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frameRef.current);
    };
  }, [delay, duration, value]);

  return <output className="dashboard-count-up" ref={elementRef}>{formatRef.current(displayValue)}</output>;
}
