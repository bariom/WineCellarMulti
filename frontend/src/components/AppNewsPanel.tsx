import type { Locale } from "../types";
import NewsPanel from "../views/landing/NewsPanel";
import { landingCopy } from "../views/landing/content";

/** The landing page updates, for signed-in users: each one opens its feature. */
export default function AppNewsPanel({ locale, open, focusToken, onOpenChange, onAction, onUnreadChange }: {
  locale: Locale;
  open: boolean;
  focusToken: number;
  onOpenChange: (open: boolean, userInitiated?: boolean) => void;
  onAction: (id: string) => void;
  onUnreadChange: (unread: boolean) => void;
}) {
  return <NewsPanel
    copy={landingCopy[locale].news}
    locale={locale}
    open={open}
    focusToken={focusToken}
    onOpenChange={onOpenChange}
    onRegister={() => undefined}
    member={{ storageKey: "vinaris.app-news", autoOpenDelayMs: 5000, onAction }}
    onUnreadChange={onUnreadChange}
  />;
}
