import type { Dispatch, SetStateAction } from "react";
import { AppIcon } from "../../components/AppIcon";
import { wineTone } from "../../components/panelSupport";
import { translate, type TranslationKey } from "../../i18n";
import type { Locale, Wine } from "../../types";

type DailySommelierBubbleProps = {
  locale: Locale;
  isMobileViewport: boolean;
  cellarSommelierOpen: boolean;
  setCellarSommelierOpen: Dispatch<SetStateAction<boolean>>;
  onDismiss: () => void;
  dailySommelierWines: Wine[];
  dailySommelierCountLabel: string;
  dailyRecommendationReason: (wine: Wine) => string;
  sommelierWindowLabel: (wine: Wine) => string;
  openWineFromDashboard: (wine: Wine) => void;
  canGenerateAi: boolean;
  openDishPairingForWine: (wine?: Wine) => void;
};

/** The floating daily sommelier on the home page: today's suggestions from the cellar. */
export default function DailySommelierBubble({
  locale,
  isMobileViewport,
  cellarSommelierOpen,
  setCellarSommelierOpen,
  onDismiss,
  dailySommelierWines,
  dailySommelierCountLabel,
  dailyRecommendationReason,
  sommelierWindowLabel,
  openWineFromDashboard,
  canGenerateAi,
  openDishPairingForWine,
}: DailySommelierBubbleProps) {
  const t = (key: TranslationKey) => translate(locale, key);
  return (
    <>
      <aside
        aria-label={t("dailySommelierTitle")}
        style={{
          position: "fixed",
          right: isMobileViewport ? 12 : 24,
          bottom: isMobileViewport ? "max(76px, calc(env(safe-area-inset-bottom, 0px) + 68px))" : 24,
          zIndex: 75,
          width: isMobileViewport ? "min(320px, calc(100vw - 24px))" : "min(360px, calc(100vw - 24px))",
          filter: "drop-shadow(0 10px 22px color-mix(in srgb, var(--collector-depth) 30%, transparent))",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 8px 7px 13px",
            border: "1px solid var(--border)",
            borderRadius: 999,
            background: "color-mix(in srgb, var(--surface-raised) 84%, transparent)",
            backdropFilter: "blur(14px) saturate(1.08)",
            boxShadow: "0 0 0 5px color-mix(in srgb, var(--accent) 16%, transparent), 0 0 30px color-mix(in srgb, var(--accent) 36%, transparent), var(--vinaris-shadow-float)",
          }}
        >
          <img
            src="/images/sommelier_ai.png"
            alt=""
            style={{ width: 42, height: 42, objectFit: "cover", objectPosition: "center 18%", borderRadius: "50%", border: "1px solid var(--border)" }}
          />
          <button
            type="button"
            aria-expanded={cellarSommelierOpen}
            onClick={() => setCellarSommelierOpen((current) => !current)}
            style={{
              display: "flex",
              flex: 1,
              alignItems: "center",
              gap: 9,
              minWidth: 0,
              padding: 0,
              border: 0,
              color: "var(--text)",
              textAlign: "left",
              background: "transparent",
              boxShadow: "none",
            }}
          >
            <AppIcon name="glass-sparkle" variant="ai" tone="accent" size="1.1rem" />
            <span style={{ display: "grid", gap: 1, minWidth: 0 }}>
              <small style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>{t("dailySommelierTitle")}</small>
              <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.82rem" }}>
                {dailySommelierWines.length} {dailySommelierCountLabel}
              </strong>
            </span>
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t("close")}
            title={t("close")}
            style={{
              display: "grid",
              placeItems: "center",
              width: 28,
              height: 28,
              padding: 0,
              border: "1px solid var(--border)",
              borderRadius: "50%",
              color: "var(--text-muted)",
              background: "var(--surface-muted)",
              boxShadow: "none",
              fontSize: "1.05rem",
            }}
          >
            ×
          </button>
        </div>
        {cellarSommelierOpen ? (
          <div
            className="dashboard-card"
            style={{ display: "grid", gap: 10, marginTop: 8, padding: 13, background: "color-mix(in srgb, var(--surface-raised) 86%, transparent)", backdropFilter: "blur(14px) saturate(1.08)" }}
          >
            {dailySommelierWines.length ? (
              <>
                <p style={{ margin: 0, color: "var(--text-muted)", lineHeight: 1.45 }}>{t("dailySommelierIntro")}</p>
                <div style={{ display: "grid", gap: 6 }}>
                  {dailySommelierWines.map((wine) => (
                    <button
                      type="button"
                      key={wine.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto minmax(0, 1fr) auto",
                        alignItems: "center",
                        gap: 8,
                        width: "100%",
                        padding: "9px 10px",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        color: "var(--text)",
                        textAlign: "left",
                        background: "var(--surface-muted)",
                        boxShadow: "none",
                      }}
                      onClick={() => openWineFromDashboard(wine)}
                    >
                      <i className={`wine-dot tone-${wineTone(wine.type)}`} />
                      <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
                        <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wine.name}</strong>
                        <small style={{ overflow: "hidden", color: "var(--text-muted)", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dailyRecommendationReason(wine)}</small>
                      </span>
                      <b style={{ whiteSpace: "nowrap" }}>{sommelierWindowLabel(wine)}</b>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p style={{ margin: 0, color: "var(--text-muted)" }}>{t("dailySommelierEmpty")}</p>
            )}
            <small style={{ color: "var(--text-muted)" }}>{t("dailySommelierFree")}</small>
            {canGenerateAi ? (
              <button
                type="button"
                className="secondary"
                style={{ width: "100%" }}
                onClick={() => openDishPairingForWine(dailySommelierWines[0])}
              >
                {t("dailySommelierPairing")}
              </button>
            ) : null}
          </div>
        ) : null}
      </aside>
    </>
  );
}
