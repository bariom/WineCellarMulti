import type { ReactNode } from "react";
import type { Locale } from "../types";

export function CollectorCardGroup({ children, className, label }: {
  children: ReactNode; className: string; label: string; locale: Locale;
}) {
  return <div className="collector-card-group">
    <div className={className} role="region" aria-label={label}>{children}</div>
  </div>;
}
