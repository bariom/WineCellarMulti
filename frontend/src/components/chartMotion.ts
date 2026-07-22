import { useEffect } from "react";
import type { RefObject } from "react";

export function useChartReveal(ref: RefObject<Element | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (element.classList.contains("chart-revealed")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      element.classList.add("chart-revealed");
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      element.classList.add("chart-revealed");
      observer.disconnect();
    }, { threshold: 0.18 });
    observer.observe(element);
    return () => observer.disconnect();
  });
}
