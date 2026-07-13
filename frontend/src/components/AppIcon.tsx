import { ReactNode, SVGProps } from "react";

export type AppIconName =
  | "bottle" | "cellar" | "dashboard" | "wishlist" | "search" | "filter" | "sort"
  | "edit" | "delete" | "import" | "export" | "compare" | "camera" | "chevron-left" | "chevron-right"
  | "sentiment-positive" | "sentiment-negative" | "status-delivered" | "status-pickup" | "status-shipped" | "status-ordered"
  | "glass-sparkle" | "calendar" | "chart" | "users" | "settings" | "logout" | "bell" | "location" | "grapes";

type AppIconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  name: AppIconName;
  title?: string;
};

/** Shared 24px outline icon language for Vinaris. Uses currentColor and has no runtime dependency. */
export function AppIcon({ name, title, ...props }: AppIconProps) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const accessible = title ? { role: "img", "aria-label": title } : { "aria-hidden": true };
  const paths: Record<AppIconName, ReactNode> = {
    bottle: <><path d="M10 3h4M11 3v4l-3.5 5.2A4.5 4.5 0 0 0 7 14.7V18a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3v-3.3a4.5 4.5 0 0 0-.5-2.5L13 7V3" /><path d="M8.5 13h7" /></>,
    cellar: <><path d="M4 20V9l8-5 8 5v11" /><path d="M4 20h16M8 20v-6h8v6M8 10h.01M16 10h.01" /></>,
    dashboard: <><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /></>,
    wishlist: <><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></>,
    search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>, filter: <><path d="M4 6h16M7 12h10M10 18h4" /></>, sort: <><path d="M8 6h10M8 12h7M8 18h4M5 4v16" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></>,
    delete: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></>,
    import: <><path d="M12 3v12m-5-5 5 5 5-5M5 21h14" /></>, export: <><path d="M12 21V9m-5 5 5-5 5 5M5 3h14" /></>,
    compare: <><path d="M8 5h8M8 19h8M6 8l-3 5h6l-3-5ZM18 8l-3 5h6l-3-5ZM12 5v14" /></>,
    camera: <><path d="M7 7l1.4-2h7.2L17 7h2.5A2.5 2.5 0 0 1 22 9.5v7A2.5 2.5 0 0 1 19.5 19h-15A2.5 2.5 0 0 1 2 16.5v-7A2.5 2.5 0 0 1 4.5 7H7Z" /><circle cx="12" cy="13" r="4" /></>,
    "chevron-left": <path d="m15 18-6-6 6-6" />, "chevron-right": <path d="m9 18 6-6-6-6" />,
    "sentiment-positive": <><circle cx="12" cy="12" r="8" /><path d="M8.5 10h.01M15.5 10h.01M8.5 14.5c2 2 5 2 7 0" /></>,
    "sentiment-negative": <><circle cx="12" cy="12" r="8" /><path d="M8.5 10h.01M15.5 10h.01M8.5 16c2-2 5-2 7 0" /></>,
    "status-delivered": <><circle cx="12" cy="12" r="8" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
    "status-pickup": <><path d="M4 7h12v9H4zM16 10h2.5l1.5 2v4H16zM8 7V5.5A1.5 1.5 0 0 1 9.5 4h1A1.5 1.5 0 0 1 12 5.5V7" /><path d="m9 12 2 2 4-4" /></>,
    "status-shipped": <><path d="M3 7h11v8H3zM14 10h3l3 3v2h-6z" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></>,
    "status-ordered": <><path d="M5 7h14v13H5zM8 4h8v3M8 12h8M8 16h5" /></>,
    "glass-sparkle": <><path d="M6 4h10v5a5 5 0 0 1-10 0V4ZM11 14v6M8 20h6" /><path d="m18 4 .7 1.8L20.5 6.5l-1.8.7L18 9l-.7-1.8-1.8-.7 1.8-.7L18 4Z" /></>,
    calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>, chart: <><path d="M5 20V10M12 20V4M19 20v-7M3 20h18" /></>, users: <><circle cx="8" cy="8" r="3" /><circle cx="16" cy="9" r="3" /><path d="M3.5 19a4.5 4.5 0 0 1 9 0M11.5 19a4.5 4.5 0 0 1 9 0" /></>,
    settings: <><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 0 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 0 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 0 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
    logout: <><path d="m10 17 5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-5M14 21h5a2 2 0 0 0 2-2" /></>, bell: <><path d="M7 9a5 5 0 1 1 10 0c0 5 2 6 2 6H5s2-1 2-6M10 19a2.4 2.4 0 0 0 4 0" /></>,
    location: <><path d="M6 10a6 6 0 1 1 12 0c0 4-6 10-6 10S6 14 6 10Z" /><circle cx="12" cy="10" r="2.5" /></>,
    grapes: <><path d="M12 4c1.8 0 3.2 1.3 3.2 3 0 1.4-.9 2.6-2.2 3M12 4c-1.8 0-3.2 1.3-3.2 3 0 1.4.9 2.6 2.2 3" /><circle cx="9.3" cy="13" r="3.2" /><circle cx="14.7" cy="13" r="3.2" /><circle cx="12" cy="18.2" r="3.2" /><path d="M12 4V2.8m0 0c1.3 0 2.6-.5 3.5-1.5" /></>,
  };
  return <svg viewBox="0 0 24 24" focusable="false" {...common} {...accessible} {...props}>{title ? <title>{title}</title> : null}{paths[name]}</svg>;
}
