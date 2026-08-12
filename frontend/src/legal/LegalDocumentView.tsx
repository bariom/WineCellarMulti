import { useEffect, useState } from "react";
import type { Locale } from "../types";
import {
  LEGAL_DOCUMENT_VERSION,
  type LegalConfig,
  type LegalDocumentKind,
} from "./legalDocuments";
import "./LegalDocumentView.css";

const emptyConfig: LegalConfig = {
  version: LEGAL_DOCUMENT_VERSION,
  operator_name: "",
  operator_address: "",
  contact_email: "",
};

function initialLocale(): Locale {
  const queryLocale = new URLSearchParams(window.location.search).get("lang");
  if (queryLocale === "it" || queryLocale === "en") return queryLocale;
  return navigator.language.toLowerCase().startsWith("it") ? "it" : "en";
}

export function LegalDocumentView({ kind }: { kind: LegalDocumentKind }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [config, setConfig] = useState<LegalConfig>(emptyConfig);

  useEffect(() => {
    fetch("/api/v1/auth/legal-config")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((payload: LegalConfig) => setConfig(payload))
      .catch(() => setConfig(emptyConfig));
  }, []);

  function changeLocale(nextLocale: Locale) {
    setLocale(nextLocale);
    const url = new URL(window.location.href);
    url.searchParams.set("lang", nextLocale);
    window.history.replaceState({}, "", url);
  }

  const otherPath = kind === "privacy" ? "/terms" : "/privacy";
  const operatorMissing =
    !config.operator_name || !config.operator_address || !config.contact_email;

  return (
    <main className="legal-shell">
      <header className="legal-header">
        <a className="legal-brand" href="/">
          <img src="/icons/icon-192.png" alt="" width="48" height="48" />
          <span>Vinaris</span>
        </a>
        <div className="legal-language" aria-label="Language">
          <button
            type="button"
            className={locale === "it" ? "active" : ""}
            onClick={() => changeLocale("it")}
          >
            IT
          </button>
          <button
            type="button"
            className={locale === "en" ? "active" : ""}
            onClick={() => changeLocale("en")}
          >
            EN
          </button>
        </div>
      </header>

      <article className="legal-document">
        {operatorMissing ? (
          <aside className="legal-configuration-warning" role="status">
            {locale === "it"
              ? "I dati pubblici del titolare non sono ancora configurati completamente."
              : "The controller's public contact details have not been fully configured yet."}
          </aside>
        ) : null}
        {kind === "privacy" ? (
          <PrivacyPolicy locale={locale} config={config} />
        ) : (
          <TermsOfService locale={locale} config={config} />
        )}
        <nav className="legal-related">
          <a href={`${otherPath}?lang=${locale}`}>
            {kind === "privacy"
              ? locale === "it"
                ? "Leggi le Condizioni d’uso"
                : "Read the Terms of Service"
              : locale === "it"
                ? "Leggi l’Informativa privacy"
                : "Read the Privacy Policy"}
          </a>
          <a href="/">{locale === "it" ? "Torna a Vinaris" : "Back to Vinaris"}</a>
        </nav>
      </article>
    </main>
  );
}

function Controller({ locale, config }: { locale: Locale; config: LegalConfig }) {
  return (
    <address>
      <strong>{config.operator_name || "Vinaris.app"}</strong>
      <span>{config.operator_address || (locale === "it" ? "Svizzera" : "Switzerland")}</span>
      {config.contact_email ? <a href={`mailto:${config.contact_email}`}>{config.contact_email}</a> : null}
    </address>
  );
}

function PrivacyPolicy({ locale, config }: { locale: Locale; config: LegalConfig }) {
  if (locale === "en") {
    return (
      <>
        <header>
          <p>Version {config.version || LEGAL_DOCUMENT_VERSION}</p>
          <h1>Privacy Policy</h1>
          <p>Effective 30 July 2026</p>
        </header>
        <section>
          <h2>1. Controller and contact</h2>
          <p>The controller responsible for personal data processed through Vinaris is:</p>
          <Controller locale={locale} config={config} />
        </section>
        <section>
          <h2>2. Data we process</h2>
          <p>We process account and profile details, cellar memberships, wine and wishlist records, tasting notes, co-ownership information, support messages, security and activity logs, subscription and AI-credit records, and photographs or files you choose to upload. Payment card data is entered directly in Stripe and is not stored by Vinaris.</p>
        </section>
        <section>
          <h2>3. Purposes</h2>
          <p>Data is used to provide and secure the service, isolate household data, manage authentication and permissions, fulfil purchases and subscriptions, deliver transactional messages, operate support, maintain backups, prevent abuse, and generate features that you explicitly request.</p>
        </section>
        <section>
          <h2>4. AI features</h2>
          <p>When you start an AI action, the wine, wishlist, dish, location, preferences, or other context required for that action may be sent to OpenAI. Personal API keys are encrypted at rest. If label recognition is enabled, a selected image may be sent to the configured recognition provider. Do not include unnecessary personal or confidential information in free-text fields submitted to AI.</p>
        </section>
        <section>
          <h2>5. Service providers and international transfers</h2>
          <p>Depending on the enabled features, data may be processed by hosting and backup providers, Stripe for payments, OpenAI for AI requests and label recognition, transactional email providers, and mapping or network providers. Some providers may process data outside Switzerland. Appropriate contractual and technical safeguards are used where required.</p>
        </section>
        <section id="cookies">
          <h2>6. Cookies and local storage</h2>
          <p>Vinaris uses an essential HTTP-only session cookie. Local or session storage is used for interface preferences, offline files selected by you, operational display state, checkout continuity, and monitor-device tokens. No advertising or behavioural analytics cookies are included in the current application.</p>
        </section>
        <section>
          <h2>7. Retention and backups</h2>
          <p>Account content is generally retained while the account or relevant household exists. You may export and delete your account from the application. Operational, contractual, payment, abuse-prevention, or security records may be retained where necessary for legal claims, statutory duties, or service security. Deleted data may remain in protected backups until their configured retention period expires; the standard remote-backup retention is 30 days.</p>
        </section>
        <section>
          <h2>8. Your rights</h2>
          <p>Subject to applicable law, you may request access, correction, export, deletion, restriction, or objection. You may also complain to the competent data-protection authority. Use the contact shown above or the in-app support form.</p>
        </section>
        <section>
          <h2>9. Security and changes</h2>
          <p>Vinaris applies access controls, household scoping, encrypted connections, restricted session cookies, encrypted secrets, backups, and monitoring. No system can guarantee absolute security. Material changes to this policy use a new version and may require renewed acceptance.</p>
        </section>
      </>
    );
  }

  return (
    <>
      <header>
        <p>Versione {config.version || LEGAL_DOCUMENT_VERSION}</p>
        <h1>Informativa sulla privacy</h1>
        <p>In vigore dal 30 luglio 2026</p>
      </header>
      <section>
        <h2>1. Titolare e contatti</h2>
        <p>Il titolare del trattamento dei dati personali effettuato tramite Vinaris è:</p>
        <Controller locale={locale} config={config} />
      </section>
      <section>
        <h2>2. Dati trattati</h2>
        <p>Trattiamo dati di account e profilo, appartenenze alle cantine, vini e wishlist, note di degustazione, informazioni di comproprietà, richieste di supporto, log di sicurezza e attività, abbonamenti e crediti AI, nonché fotografie o file caricati volontariamente. I dati delle carte sono inseriti direttamente in Stripe e non sono conservati da Vinaris.</p>
      </section>
      <section>
        <h2>3. Finalità</h2>
        <p>I dati servono a fornire e proteggere il servizio, isolare i dati delle diverse cantine, gestire autenticazione e permessi, eseguire acquisti e abbonamenti, inviare comunicazioni transazionali, prestare assistenza, mantenere backup, prevenire abusi e generare le funzioni richieste espressamente dall’utente.</p>
      </section>
      <section>
        <h2>4. Funzioni AI</h2>
        <p>Quando avvii una funzione AI, i dati del vino, della wishlist, del piatto, della località, delle preferenze o altro contesto necessario possono essere inviati a OpenAI. Le chiavi API personali sono cifrate a riposo. Se il riconoscimento etichetta è attivo, l’immagine selezionata può essere inviata al fornitore configurato. Non inserire dati personali o confidenziali non necessari nei testi destinati all’AI.</p>
      </section>
      <section>
        <h2>5. Fornitori e trasferimenti internazionali</h2>
        <p>In base alle funzioni abilitate, i dati possono essere trattati da fornitori di hosting e backup, Stripe per i pagamenti, OpenAI per le richieste AI e il riconoscimento delle etichette, fornitori email transazionali e fornitori cartografici o di rete. Alcuni fornitori possono trattare dati fuori dalla Svizzera. Quando richiesto vengono adottate garanzie contrattuali e tecniche adeguate.</p>
      </section>
      <section id="cookies">
        <h2>6. Cookie e memoria locale</h2>
        <p>Vinaris utilizza un cookie di sessione essenziale, HTTP-only. La memoria locale o di sessione conserva preferenze dell’interfaccia, file offline scelti dall’utente, stato operativo della UI, continuità del checkout e token dei dispositivi Monitor. L’applicazione attuale non include cookie pubblicitari o di analisi comportamentale.</p>
      </section>
      <section>
        <h2>7. Conservazione e backup</h2>
        <p>I contenuti dell’account sono generalmente conservati finché esiste l’account o la cantina interessata. L’utente può esportare i dati e cancellare l’account dall’app. Dati operativi, contrattuali, di pagamento, sicurezza o prevenzione abusi possono essere conservati quando necessario per obblighi legali, pretese o sicurezza. I dati cancellati possono permanere nei backup protetti fino alla scadenza della conservazione configurata; la conservazione remota standard è di 30 giorni.</p>
      </section>
      <section>
        <h2>8. Diritti</h2>
        <p>Nei limiti della legge applicabile puoi chiedere accesso, rettifica, esportazione, cancellazione, limitazione o opposizione. Puoi inoltre rivolgerti all’autorità competente. Usa il contatto indicato sopra o il modulo di supporto nell’app.</p>
      </section>
      <section>
        <h2>9. Sicurezza e modifiche</h2>
        <p>Vinaris adotta controlli di accesso, separazione per cantina, connessioni cifrate, cookie di sessione limitati, cifratura dei segreti, backup e monitoraggio. Nessun sistema può garantire sicurezza assoluta. Le modifiche sostanziali usano una nuova versione e possono richiedere una nuova accettazione.</p>
      </section>
    </>
  );
}

function TermsOfService({ locale, config }: { locale: Locale; config: LegalConfig }) {
  if (locale === "en") {
    return (
      <>
        <header>
          <p>Version {config.version || LEGAL_DOCUMENT_VERSION}</p>
          <h1>Terms of Service</h1>
          <p>Effective 30 July 2026</p>
        </header>
        <section>
          <h2>1. Provider and acceptance</h2>
          <p>These terms govern access to Vinaris, provided by:</p>
          <Controller locale={locale} config={config} />
          <p>By creating an account or accepting a new version, you agree to these terms and the Privacy Policy.</p>
        </section>
        <section>
          <h2>2. Service and account</h2>
          <p>Vinaris provides private-cellar inventory, collaboration, valuation, tasting, purchasing, and AI-assisted tools. You must provide accurate account information, protect your credentials, and promptly report suspected misuse. Household owners and administrators control membership and visibility.</p>
        </section>
        <section>
          <h2>3. Subscriptions, redeem codes, and AI credits</h2>
          <p>Prices, currency, billing interval, renewal, and cancellation terms displayed in Stripe Checkout form part of the purchase. Subscriptions can be managed through the available billing portal. Redeem codes and AI credits are personal, have the stated duration or balance, and may not be resold unless expressly authorised. Mandatory consumer rights remain unaffected.</p>
        </section>
        <section>
          <h2>4. AI, market data, and recommendations</h2>
          <p>AI output, drinking windows, scores, pairings, product availability, and value estimates are informational and may be incomplete, outdated, or incorrect. They are not financial, legal, tax, health, or professional appraisal advice. Verify important decisions, sources, prices, stock, storage conditions, and alcohol-related obligations independently.</p>
        </section>
        <section>
          <h2>5. User content and bottle photographs</h2>
          <p>You retain ownership of your content and grant Vinaris the rights necessary to store, process, back up, and display it for the service. When uploading a bottle photograph, you confirm that you own it or have permission to use it. If Vinaris has no reference image for that bottle, you grant Vinaris a worldwide, royalty-free, non-exclusive, perpetual licence to retain and show it as a reference image to other users. You remain responsible for third-party rights and unlawful content.</p>
        </section>
        <section>
          <h2>6. Co-ownership and shared records</h2>
          <p>Co-ownership agreements, payment ledgers, shares, and invitations are record-keeping tools. They do not replace a signed legal agreement, tax advice, title documentation, or payment services. Participants are responsible for verifying identity, authority, ownership, custody, and applicable law.</p>
        </section>
        <section>
          <h2>7. Acceptable use</h2>
          <p>You may not break access controls, access another household without permission, upload malware or infringing material, abuse providers or payment systems, automate excessive requests, reverse engineer protected services, or use Vinaris unlawfully. Access may be restricted to protect users, the service, or third parties.</p>
        </section>
        <section>
          <h2>8. Availability, backups, and liability</h2>
          <p>The service may be interrupted for maintenance, provider failures, security incidents, or events beyond reasonable control. Users should keep exports appropriate to the importance of their records. To the extent permitted by law, indirect or consequential losses and losses caused by unverified AI or market information are excluded. Liability that cannot legally be excluded remains unaffected.</p>
        </section>
        <section>
          <h2>9. Termination, changes, and law</h2>
          <p>You may delete your account using the application. Certain records may be retained as described in the Privacy Policy or where required by law. Material changes use a new document version and may require renewed acceptance. Swiss law applies, subject to mandatory consumer protections and mandatory jurisdiction rules.</p>
        </section>
      </>
    );
  }

  return (
    <>
      <header>
        <p>Versione {config.version || LEGAL_DOCUMENT_VERSION}</p>
        <h1>Condizioni d’uso</h1>
        <p>In vigore dal 30 luglio 2026</p>
      </header>
      <section>
        <h2>1. Fornitore e accettazione</h2>
        <p>Le presenti condizioni disciplinano l’accesso a Vinaris, fornito da:</p>
        <Controller locale={locale} config={config} />
        <p>Creando un account o accettando una nuova versione, accetti queste condizioni e l’Informativa privacy.</p>
      </section>
      <section>
        <h2>2. Servizio e account</h2>
        <p>Vinaris offre strumenti per inventario della cantina privata, collaborazione, valore, degustazioni, acquisti e funzioni assistite dall’AI. Devi fornire dati corretti, proteggere le credenziali e segnalare tempestivamente usi sospetti. Proprietari e amministratori delle cantine controllano membri e visibilità.</p>
      </section>
      <section>
        <h2>3. Abbonamenti, codici e crediti AI</h2>
        <p>Prezzo, valuta, periodicità, rinnovo e cancellazione mostrati in Stripe Checkout fanno parte dell’acquisto. Gli abbonamenti possono essere gestiti tramite il portale disponibile. Codici e crediti AI sono personali, hanno durata o saldo indicati e non possono essere rivenduti senza autorizzazione. Restano impregiudicati i diritti inderogabili dei consumatori.</p>
      </section>
      <section>
        <h2>4. AI, mercato e raccomandazioni</h2>
        <p>Output AI, finestre di beva, punteggi, abbinamenti, disponibilità e stime di valore sono informativi e possono essere incompleti, superati o errati. Non costituiscono consulenza finanziaria, legale, fiscale, sanitaria o una perizia professionale. Verifica autonomamente decisioni importanti, fonti, prezzi, disponibilità, conservazione e obblighi relativi all’alcol.</p>
      </section>
      <section>
        <h2>5. Contenuti e fotografie</h2>
        <p>Conservi la titolarità dei contenuti e concedi a Vinaris i diritti necessari per conservarli, elaborarli, sottoporli a backup e mostrarli nel servizio. Caricando la foto di una bottiglia dichiari di esserne autore o di avere il permesso di usarla. Se manca un’immagine di riferimento della stessa bottiglia, concedi a Vinaris una licenza mondiale, gratuita, non esclusiva e perpetua per conservarla e mostrarla come riferimento ad altri utenti. Resti responsabile dei diritti di terzi e dei contenuti illeciti.</p>
      </section>
      <section>
        <h2>6. Comproprietà e registri condivisi</h2>
        <p>Accordi di comproprietà, registri dei versamenti, quote e inviti sono strumenti organizzativi. Non sostituiscono un contratto firmato, consulenza fiscale, prova della proprietà o servizi di pagamento. I partecipanti devono verificare identità, poteri, titolarità, custodia e legge applicabile.</p>
      </section>
      <section>
        <h2>7. Uso consentito</h2>
        <p>Non puoi eludere controlli di accesso, entrare in cantine senza permesso, caricare malware o materiale illecito, abusare di fornitori o pagamenti, automatizzare richieste eccessive, decodificare servizi protetti o usare Vinaris illegalmente. L’accesso può essere limitato per proteggere utenti, servizio o terzi.</p>
      </section>
      <section>
        <h2>8. Disponibilità, backup e responsabilità</h2>
        <p>Il servizio può interrompersi per manutenzione, guasti dei fornitori, incidenti di sicurezza o eventi fuori dal ragionevole controllo. Gli utenti dovrebbero conservare esportazioni proporzionate all’importanza dei dati. Nei limiti di legge sono esclusi danni indiretti o consequenziali e perdite dovute a informazioni AI o di mercato non verificate. Restano ferme le responsabilità inderogabili.</p>
      </section>
      <section>
        <h2>9. Cessazione, modifiche e legge</h2>
        <p>Puoi cancellare l’account dall’app. Alcuni dati possono essere conservati come descritto nell’Informativa privacy o quando richiesto dalla legge. Le modifiche sostanziali usano una nuova versione e possono richiedere una nuova accettazione. Si applica il diritto svizzero, fatti salvi tutela inderogabile dei consumatori e fori obbligatori.</p>
      </section>
    </>
  );
}
