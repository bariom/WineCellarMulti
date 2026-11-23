import { AppIcon } from "../../components/AppIcon";
import type { Locale } from "../../types";
import "./EmptyCellarWelcome.css";

type Props = {
  locale: Locale;
  canWrite: boolean;
  onAddWine: () => void;
  onImport: () => void;
  onOpenHelp: () => void;
};

const PROMISES: ReadonlyArray<{ icon: "calendar" | "chart" | "glass-sparkle"; it: [string, string]; en: [string, string] }> = [
  { icon: "calendar", it: ["Quando aprirle", "Una finestra di beva per ogni bottiglia, divisa in fasi."], en: ["When to open them", "A drinking window for every bottle, split into stages."] },
  { icon: "chart", it: ["Quanto valgono", "Stime dai prezzi delle enoteche, con le fonti."], en: ["What they are worth", "Estimates from wine-shop prices, with the sources."] },
  { icon: "glass-sparkle", it: ["Cosa bere stasera", "Il Sommelier sceglie solo tra le tue bottiglie."], en: ["What to drink tonight", "The Sommelier picks only from your own bottles."] },
];

/**
 * Home for a cellar with no wines yet: instead of dashboards full of zeros, one
 * clear way to add the first bottle and what the cellar will show once it has some.
 */
export default function EmptyCellarWelcome({ locale, canWrite, onAddWine, onImport, onOpenHelp }: Props) {
  const it = locale === "it";
  return (
    <section className="empty-cellar-welcome" aria-labelledby="empty-cellar-welcome-title">
      <div className="empty-cellar-welcome-lead">
        <p className="empty-cellar-welcome-eyebrow">{it ? "Benvenuto in Vinaris" : "Welcome to Vinaris"}</p>
        <h2 id="empty-cellar-welcome-title">{it ? "La tua cantina è pronta. Aggiungi il primo vino." : "Your cellar is ready. Add your first wine."}</h2>
        <p>
          {it
            ? "Fotografa l'etichetta o lo scontrino, oppure inserisci il vino a mano: bastano pochi secondi. Hai già un elenco? Importalo da Excel o da CellarTracker."
            : "Photograph the label or the receipt, or enter the wine by hand: it takes a few seconds. Already keep a list? Import it from a spreadsheet or CellarTracker."}
        </p>
        {canWrite ? (
          <div className="empty-cellar-welcome-actions">
            <button type="button" onClick={onAddWine}>
              {it ? "Aggiungi il primo vino" : "Add your first wine"}
            </button>
            <button type="button" className="secondary" onClick={onImport}>
              {it ? "Importa un elenco" : "Import a list"}
            </button>
          </div>
        ) : (
          <p className="empty-cellar-welcome-note">
            {it ? "Chi gestisce questa cantina non ha ancora aggiunto vini." : "The people managing this cellar have not added any wines yet."}
          </p>
        )}
        <button type="button" className="empty-cellar-welcome-help" onClick={onOpenHelp}>
          {it ? "Come funziona Vinaris" : "How Vinaris works"}
        </button>
      </div>
      <ul className="empty-cellar-welcome-promises" aria-label={it ? "Cosa vedrai con i primi vini" : "What you will see with your first wines"}>
        {PROMISES.map((item) => {
          const [title, text] = item[it ? "it" : "en"];
          return (
            <li key={item.icon}>
              <AppIcon name={item.icon} variant="feature" tone="accent" size="1.25rem" />
              <strong>{title}</strong>
              <span>{text}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
