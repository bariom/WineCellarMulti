import { AppIcon, type AppIconName } from "../components/AppIcon";
import type { EventFeature, Locale, SessionEvent } from "../types";
import "./EventWelcomeView.css";

/**
 * Where the event QR code lands: the event's name, what the sommelier can do
 * tonight (only the features the event offers), and the way to keep it all.
 */
export default function EventWelcomeView({ locale, event, onOpen, onKeep }: {
  locale: Locale;
  event: SessionEvent;
  onOpen: (feature: EventFeature) => void;
  onKeep: () => void;
}) {
  const it = locale === "it";
  const place = `${event.name}${event.place ? ` · ${event.place}` : ""}`;
  const until = new Date(event.visitor_until);
  const untilLabel = Number.isFinite(until.getTime()) ? until.toLocaleTimeString(it ? "it-CH" : "en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
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
      title: it ? "Cosa c’è in questa bottiglia?" : "What is in this bottle?",
      body: it ? "Fotografa l’etichetta: produttore, annata, vitigni, finestra di beva e cosa aspettarti nel bicchiere." : "Photograph the label: producer, vintage, grapes, drinking window and what to expect in the glass.",
      action: it ? "Fotografa l’etichetta" : "Photograph the label",
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

    <p className="event-welcome-footnote">{it
      ? `Visita valida${untilLabel ? ` fino alle ${untilLabel}` : ""} · le foto vengono elaborate senza essere archiviate · continuando accetti privacy e condizioni d’uso.`
      : `Visit valid${untilLabel ? ` until ${untilLabel}` : ""} · photos are processed without being stored · by continuing you accept the privacy policy and terms.`}</p>
  </section>;
}
