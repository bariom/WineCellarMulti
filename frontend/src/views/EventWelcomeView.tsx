import { AppIcon, type AppIconName } from "../components/AppIcon";
import type { EventFeature, Locale, SessionEvent, Wine } from "../types";
import "./EventWelcomeView.css";

/**
 * Where the event QR code lands: the event's name, what the sommelier can do
 * tonight (only the features the event offers), and the way to keep it all.
 */
export default function EventWelcomeView({ locale, event, wines, onOpen, onKeep, onExploreDemo, onOpenWine, onRemoveWine }: {
  locale: Locale;
  event: SessionEvent;
  /** The bottles the guest photographed tonight: theirs until the visit ends, or for good with an account. */
  wines: Wine[];
  onOpen: (feature: EventFeature) => void;
  onKeep: () => void;
  /** The public demo cellar: what Vinaris does beyond tonight. */
  onExploreDemo: () => void;
  /** The wine's detail: what the catalogue and the AI found about it. */
  onOpenWine: (wine: Wine) => void;
  onRemoveWine: (wine: Wine) => void;
}) {
  const it = locale === "it";
  const place = `${event.name}${event.place ? ` · ${event.place}` : ""}`;
  const until = new Date(event.visitor_until);
  const untilLabel = Number.isFinite(until.getTime()) ? until.toLocaleTimeString(it ? "it-CH" : "en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
  const bottleCount = wines.reduce((total, wine) => total + (wine.quantity || 0), 0);
  const catalogue: Record<EventFeature, { icon: AppIconName; title: string; body: string; action: string }> = {
    restaurant_wine_list: {
      icon: "tasting",
      title: it ? "Scegli dalla carta dei vini" : "Choose from the wine list",
      body: it ? "Fotografa la carta, di’ cosa mangi e quanto vuoi spendere: il sommelier legge le voci e ti indica le bottiglie giuste, con il perché." : "Photograph the list, say what you are eating and how much you want to spend: the sommelier reads it and points to the right bottles, with the reasons.",
      action: it ? "Fotografa la carta" : "Photograph the list",
    },
    dish_pairing: {
      icon: "glass-sparkle",
      title: it ? "Un vino per il tuo piatto" : "A wine for your dish",
      body: it ? "Indica il piatto: ricevi una proposta di vini da ordinare, con stile, regione e fascia di prezzo." : "Tell us the dish: get wines to order, with style, region and price range.",
      action: it ? "Indica il piatto" : "Tell us the dish",
    },
    bottle_photo: {
      icon: "camera",
      title: it ? "Riconosci le bottiglie" : "Recognise the bottles",
      body: it ? "Fotografa le etichette: il sommelier le riconosce e le tiene qui per stasera, con produttore, annata e cosa aspettarti nel bicchiere." : "Photograph the labels: the sommelier recognises them and keeps them here for tonight, with producer, vintage and what to expect in the glass.",
      action: it ? "Fotografa le bottiglie" : "Photograph the bottles",
    },
    assistant: {
      icon: "assistant",
      title: it ? "Chiedi al sommelier" : "Ask the sommelier",
      body: it ? "Una domanda a voce o per iscritto: un abbinamento, un vitigno, una regione, cosa bere stasera." : "Ask by voice or text: a pairing, a grape, a region, what to drink tonight.",
      action: it ? "Fai una domanda" : "Ask a question",
    },
    buying_advice: {
      icon: "buying",
      title: it ? "Cosa comprare" : "What to buy",
      body: it ? "Consigli d’acquisto su misura: bottiglie da cercare, dove trovarle e a che prezzo." : "Tailored buying advice: bottles to look for, where to find them and at what price.",
      action: it ? "Chiedi un consiglio" : "Ask for advice",
    },
    wine_pulse: {
      icon: "pulse",
      title: it ? "Wine Pulse: le notizie del vino" : "Wine Pulse: the wine news",
      body: it ? "Le notizie dal mondo del vino scelte e riassunte ogni giorno: produttori, annate, mercati, territori." : "The news from the wine world, selected and summarised every day: producers, vintages, markets, regions.",
      action: it ? "Leggi le notizie" : "Read the news",
    },
  };
  const features = event.features.filter((feature): feature is EventFeature => feature in catalogue);

  return <section className="event-welcome" aria-labelledby="event-welcome-title">
    <header className="event-welcome-hero">
      <p className="event-welcome-kicker">Vinaris at {place}</p>
      <h1 id="event-welcome-title">{it ? "Il sommelier AI è al tuo tavolo." : "The AI sommelier is at your table."}</h1>
      <p className="event-welcome-lead">{it
        ? "Offerto da Vinaris per questa serata: nessuna registrazione, nessun costo. Scegli da dove partire."
        : "Offered by Vinaris for tonight: no sign-up, no cost. Choose where to start."}</p>
    </header>

    <div className={`event-welcome-features count-${features.length}`}>
      {features.map((feature) => {
        const card = catalogue[feature];
        return <button key={feature} type="button" className="event-welcome-card" onClick={() => onOpen(feature)}>
          <span className="event-welcome-icon"><AppIcon name={card.icon} variant="ai" detailLevel="rich" /></span>
          <span className="event-welcome-text">
            <strong>{card.title}</strong>
            <span>{card.body}</span>
          </span>
          <span className="event-welcome-action">{card.action} <i aria-hidden="true">→</i></span>
        </button>;
      })}
    </div>

    {wines.length ? <section className="event-welcome-bottles" aria-labelledby="event-welcome-bottles-title">
      <header>
        <div>
          <p className="event-welcome-kicker">{it ? "Fotografate stasera" : "Photographed tonight"}</p>
          <h2 id="event-welcome-bottles-title">{it ? "Le bottiglie di stasera" : "Tonight's bottles"}</h2>
        </div>
        <span className="event-welcome-bottles-count">{bottleCount} {it ? (bottleCount === 1 ? "bottiglia" : "bottiglie") : (bottleCount === 1 ? "bottle" : "bottles")}</span>
      </header>
      <ul>
        {wines.map((wine) => <li key={wine.id}>
          <button type="button" className="event-welcome-bottle-text" aria-label={it ? `Dettaglio di ${wine.name}` : `Details of ${wine.name}`} onClick={() => onOpenWine(wine)}>
            <strong>{wine.name}</strong>
            <span>{[wine.producer, wine.vintage, wine.region].filter(Boolean).join(" · ")}</span>
            <small>{it ? "Vedi il dettaglio" : "See the details"} <i aria-hidden="true">→</i></small>
          </button>
          <span className="event-welcome-bottle-quantity">×{wine.quantity}</span>
          <button type="button" className="secondary compact event-welcome-bottle-remove" aria-label={it ? `Rimuovi ${wine.name}` : `Remove ${wine.name}`} onClick={() => onRemoveWine(wine)}>{it ? "Rimuovi" : "Remove"}</button>
        </li>)}
      </ul>
      <p className="event-welcome-bottles-note">{it
        ? `Restano qui fino alla fine della serata${untilLabel ? ` (${untilLabel})` : ""}, poi vengono eliminate. Crea il tuo account per tenerle nella tua cantina.`
        : `They stay here until the visit ends${untilLabel ? ` (${untilLabel})` : ""}, then they are deleted. Create your account to keep them in your cellar.`}</p>
      <button type="button" onClick={onKeep}>{it ? "Tieni le bottiglie: crea il mio account" : "Keep the bottles: create my account"}</button>
    </section> : null}

    <section className="event-welcome-how" aria-label={it ? "Come funziona" : "How it works"}>
      <ol>
        <li><b>1</b><span>{it ? "Scegli una delle proposte qui sopra." : "Pick one of the options above."}</span></li>
        <li><b>2</b><span>{it ? "Il sommelier risponde in pochi secondi, con le sue ragioni." : "The sommelier answers in seconds, with its reasons."}</span></li>
        <li><b>3</b><span>{it ? "Se ti piace, tieni la serata: diventa il tuo account Vinaris." : "If you like it, keep tonight: it becomes your Vinaris account."}</span></li>
      </ol>
    </section>

    <section className="event-welcome-keep">
      <div>
        <p className="event-welcome-kicker">{it ? "Dopo stasera" : "After tonight"}</p>
        <h2>{it ? "Tieni questa serata" : "Keep tonight"}</h2>
        <p>{it
          ? "Con nome, e-mail e password quello che fai stasera diventa il tuo account: la tua cantina, il tuo profilo di gusto, i tuoi ricordi. Niente ricomincia da zero."
          : "With a name, an e-mail and a password, what you do tonight becomes your account: your cellar, your taste profile, your memories. Nothing starts over."}</p>
      </div>
      <button type="button" onClick={onKeep}>{it ? "Crea il mio account" : "Create my account"}</button>
    </section>

    <section className="event-welcome-demo">
      <div>
        <p className="event-welcome-kicker">{it ? "Oltre stasera" : "Beyond tonight"}</p>
        <h2>{it ? "Cosa fa Vinaris con una cantina vera" : "What Vinaris does with a real cellar"}</h2>
        <p>{it
          ? "Una cantina già popolata da esplorare: bottiglie con finestra di beva e valore, il profilo di gusto, i ricordi delle serate, il sommelier che consiglia cosa aprire. Da qui puoi tornare alla serata quando vuoi."
          : "A populated cellar to explore: bottles with drinking window and value, the taste profile, memories of evenings, the sommelier that says what to open. You can come back to tonight whenever you like."}</p>
      </div>
      <button type="button" className="secondary" onClick={onExploreDemo}>{it ? "Esplora la demo" : "Explore the demo"}</button>
    </section>

    <p className="event-welcome-footnote">{it
      ? `Visita valida${untilLabel ? ` fino alle ${untilLabel}` : ""} · le foto vengono elaborate senza essere archiviate · continuando accetti privacy e condizioni d’uso.`
      : `Visit valid${untilLabel ? ` until ${untilLabel}` : ""} · photos are processed without being stored · by continuing you accept the privacy policy and terms.`}</p>
  </section>;
}
