import type { Locale } from "../types";
import { AppIcon, type AppIconName } from "../components/AppIcon";
import "./SommelierHubView.css";

export type SommelierDestination = "assistant" | "pairing-home" | "pairing-restaurant" | "shelf" | "buying" | "strategy";

type HubCard = {
  id: SommelierDestination;
  icon: AppIconName;
  title: string;
  body: string;
  /** When the feature is part of a plan the user does not have yet. */
  locked?: boolean;
};

/**
 * Every AI feature in one place, each with a line on what it does, so none of
 * them hides behind a menu or a switch inside another page.
 */
export default function SommelierHubView({ locale, showAssistant, assistantLocked, showStrategy, shelfLocked, onOpen }: {
  locale: Locale;
  showAssistant: boolean;
  assistantLocked: boolean;
  showStrategy: boolean;
  shelfLocked: boolean;
  onOpen: (destination: SommelierDestination) => void;
}) {
  const it = locale === "it";
  const cards: HubCard[] = [
    ...(showAssistant ? [{
      id: "assistant" as const, icon: "assistant" as const, locked: assistantLocked,
      title: it ? "Chiedi alla tua cantina" : "Ask your cellar",
      body: it ? "Domande a voce o per iscritto: cosa ho, quanto vale, cosa aprire, cosa ho bevuto." : "Ask by voice or text: what you have, what it is worth, what to open, what you drank.",
    }] : []),
    {
      id: "pairing-home", icon: "glass-sparkle",
      title: it ? "Abbinamento a casa" : "Pairing at home",
      body: it ? "Dimmi il piatto: scelgo le bottiglie giuste dalla tua cantina. O parti da un vino e trova il piatto." : "Tell me the dish and I pick the right bottles from your cellar. Or start from a wine and find the dish.",
    },
    {
      id: "pairing-restaurant", icon: "tasting",
      title: it ? "Al ristorante" : "At the restaurant",
      body: it ? "Fotografa la carta dei vini e scopri cosa ordinare per il tuo gusto e il tuo budget." : "Photograph the wine list and find what to order for your taste and budget.",
    },
    {
      id: "shelf", icon: "camera", locked: shelfLocked,
      title: it ? "In enoteca: Scaffale AI" : "At the wine shop: Shelf scanner",
      body: it ? "Fotografa lo scaffale: ti indico sulla foto la prima, la seconda e la terza scelta." : "Photograph the shelf: I mark your first, second and third choice on the photo.",
    },
    {
      id: "buying", icon: "buying",
      title: it ? "Cosa comprare" : "What to buy",
      body: it ? "Consigli d'acquisto per completare la cantina, con dove trovarli e a che prezzo." : "Buying advice to round out your cellar, with where to find it and at what price.",
    },
    ...(showStrategy ? [{
      id: "strategy" as const, icon: "dashboard-cards" as const,
      title: it ? "Strategia della cantina" : "Cellar strategy",
      body: it ? "Obiettivi per ogni bottiglia, piano d'azione e cosa bere prima che sia tardi." : "A goal for each bottle, an action plan and what to drink before it is too late.",
    }] : []),
  ];

  return <section className="sommelier-hub" aria-labelledby="sommelier-hub-title">
    <header className="sommelier-hub-header">
      <p>{it ? "Il tuo sommelier personale" : "Your personal sommelier"}</p>
      <h1 id="sommelier-hub-title">Sommelier AI</h1>
      <span>{it ? "Tutto quello che l'AI di Vinaris sa fare con la tua cantina. Scegli da dove partire." : "Everything Vinaris AI can do with your cellar. Choose where to start."}</span>
    </header>
    <div className="sommelier-hub-grid">
      {cards.map((card) => <button key={card.id} type="button" className="sommelier-hub-card" onClick={() => onOpen(card.id)}>
        <span className="sommelier-hub-icon"><AppIcon name={card.icon} variant="ai" detailLevel="rich" /></span>
        <span className="sommelier-hub-text">
          <strong>{card.title}{card.locked ? <em>Riserva</em> : null}</strong>
          <span>{card.body}</span>
        </span>
        <span className="sommelier-hub-go" aria-hidden="true">→</span>
      </button>)}
    </div>
  </section>;
}
