// Labels and status badges for the app user administration screens.

import type { CSSProperties } from "react";
import type { AppUser, Locale } from "../types";

export function appUserEntitlementStatus(user: AppUser, locale: Locale): { label: string; style: CSSProperties } | null {
  if (user.is_app_admin) return null;
  if (user.has_demo_access) {
    return {
      label: locale === "it" ? "Demo · accesso illimitato" : "Demo · unlimited access",
      style: { color: "var(--primary)", borderColor: "var(--primary)", background: "var(--success-surface)" },
    };
  }
  const days = user.entitlement_days_remaining ?? 0;
  const dayLabel = locale === "it" ? (days === 1 ? "giorno residuo" : "giorni residui") : (days === 1 ? "day remaining" : "days remaining");
  if (days <= 0) return null;
  if (days <= 7) {
    return {
      label: `${locale === "it" ? "In scadenza" : "Expiring"} · ${days} ${dayLabel}`,
      style: { color: "var(--accent)", borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 14%, var(--surface-raised))" },
    };
  }
  return {
    label: `${locale === "it" ? "Attivo" : "Active"} · ${days} ${dayLabel}`,
    style: { color: "var(--primary)", borderColor: "var(--primary)", background: "var(--success-surface)" },
  };
}

export function appUserTierStatus(user: AppUser, locale: Locale): { label: string; configured: boolean } {
  if (user.is_ambassador) return { label: "Vinaris Ambassador", configured: true };
  const hasActiveEntitlement = (user.entitlement_days_remaining ?? 0) > 0;
  const tier = user.has_demo_access
    ? (locale === "it" ? "Demo" : "Demo")
    : user.is_app_admin
      ? (locale === "it" ? "Riserva" : "Reserve")
      : hasActiveEntitlement && user.can_use_restaurant_mode
        ? (locale === "it" ? "Carta" : "Wine list")
        : hasActiveEntitlement
          ? (locale === "it" ? "Riserva" : "Reserve")
          : (locale === "it" ? "Gratuito" : "Free");
  return {
    label: `${locale === "it" ? "Piano" : "Tier"} · ${tier}`,
    configured: tier !== (locale === "it" ? "Gratuito" : "Free"),
  };
}

export function appUserActivityStatus(user: AppUser, locale: Locale): { label: string; style: CSSProperties } {
  const days = user.last_activity_days_ago;
  if (days === null) {
    return {
      label: locale === "it" ? "Mai attivo" : "Never active",
      style: { color: "var(--text-muted)", borderColor: "var(--border)", background: "var(--surface-muted)" },
    };
  }
  if (days === 0) {
    return {
      label: locale === "it" ? "Attivo oggi" : "Active today",
      style: { color: "var(--primary)", borderColor: "var(--primary)", background: "var(--success-surface)" },
    };
  }
  if (days === 1) {
    return {
      label: locale === "it" ? "Attivo ieri" : "Active yesterday",
      style: { color: "var(--primary)", borderColor: "var(--primary)", background: "var(--success-surface)" },
    };
  }
  if (days <= 7) {
    return {
      label: locale === "it" ? `Attivo ${days} g fa` : `Active ${days}d ago`,
      style: { color: "var(--primary)", borderColor: "var(--primary)", background: "var(--success-surface)" },
    };
  }
  if (days <= 30) {
    return {
      label: locale === "it" ? `Ultima attivit\u00e0 ${days} g fa` : `Last active ${days}d ago`,
      style: { color: "var(--accent)", borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 14%, var(--surface-raised))" },
    };
  }
  return {
    label: locale === "it" ? `Inattivo da ${days} g` : `Inactive ${days}d`,
    style: { color: "var(--danger)", borderColor: "var(--danger)", background: "color-mix(in srgb, var(--danger) 10%, var(--surface-raised))" },
  };
}

export function appUserInitials(user: AppUser) {
  const source = user.display_name.trim() || user.email.split("@")[0] || "V";
  const parts = source.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1]?.[0] || ""}` : source.slice(0, 2)).toLocaleUpperCase();
}

export function appUserRoleLabel(user: AppUser, locale: Locale) {
  if (user.is_app_admin) return locale === "it" ? "Amministratore" : "Administrator";
  if (user.can_use_restaurant_mode) return locale === "it" ? "Ristorante" : "Restaurant";
  return locale === "it" ? "Utente" : "User";
}

export function appUserPlanLabel(user: AppUser, locale: Locale) {
  if (user.is_ambassador) return "Vinaris Ambassador";
  const hasActiveEntitlement = (user.entitlement_days_remaining ?? 0) > 0;
  if (user.has_demo_access) return "Demo";
  if (user.is_app_admin) return locale === "it" ? "Riserva" : "Reserve";
  if (hasActiveEntitlement && user.can_use_restaurant_mode) return locale === "it" ? "Carta" : "Wine list";
  if (hasActiveEntitlement) return locale === "it" ? "Riserva" : "Reserve";
  return locale === "it" ? "Gratuito" : "Free";
}
