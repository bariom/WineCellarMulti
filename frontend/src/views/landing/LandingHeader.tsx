import { useEffect, useState } from "react";
import type { Locale } from "../../types";
import type { LandingCopy } from "./content";

type LandingHeaderProps = {
  copy: LandingCopy;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  onLogin: () => void;
  onRegister: () => void;
};

export default function LandingHeader({ copy, locale, onLocaleChange, onLogin, onRegister }: LandingHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 18);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  const navItems = [
    ["#product", copy.nav.product],
    ["#maturity", copy.nav.maturity],
    ["#sommelier", copy.nav.sommelier],
    ["#insights", copy.nav.insights],
    ["#access", copy.nav.pricing],
  ];

  return (
    <header className={`marketing-header${scrolled ? " is-scrolled" : ""}`}>
      <a className="marketing-brand" href="#top" aria-label="Vinaris">
        <img src="/icons/icon-192.png" alt="" width="42" height="42" fetchPriority="high" />
        <span><strong>Vinaris</strong><small>Private cellar intelligence</small></span>
      </a>
      <button
        type="button"
        className="marketing-menu-toggle"
        aria-expanded={menuOpen}
        aria-controls="marketing-navigation"
        aria-label={menuOpen ? copy.header.close : copy.header.menu}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <i /><i /><i />
      </button>
      <div id="marketing-navigation" className={`marketing-header-panel${menuOpen ? " is-open" : ""}`}>
        <nav aria-label={copy.nav.product}>
          {navItems.map(([href, label]) => <a href={href} key={href} onClick={() => setMenuOpen(false)}>{label}</a>)}
        </nav>
        <div className="marketing-header-actions">
          <label>
            <span className="sr-only">{copy.header.language}</span>
            <select value={locale} onChange={(event) => onLocaleChange(event.target.value as Locale)} aria-label={copy.header.language}>
              <option value="it">IT</option>
              <option value="en">EN</option>
            </select>
          </label>
          <button type="button" className="marketing-button text" onClick={onLogin}>{copy.header.login}</button>
          <button type="button" className="marketing-button primary compact" onClick={onRegister}>{copy.header.register}</button>
        </div>
      </div>
    </header>
  );
}
