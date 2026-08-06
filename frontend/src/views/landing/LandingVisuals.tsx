import { useEffect, useRef, useState } from "react";
import type { Locale } from "../../types";
import type { LandingCopy } from "./content";

export function LandingIcon({ name }: { name: "search" | "window" | "insights" | "camera" | "spark" | "cellar" }) {
  const paths = {
    search: <><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 4 4" /></>,
    window: <><path d="M4 6h16M6 3v6m12-6v6M5 11h14v9H5z" /><path d="M9 15h6" /></>,
    insights: <><path d="M4 19V9m6 10V5m6 14v-7m4 7H2" /></>,
    camera: <><path d="M4 7h4l1.5-2h5L16 7h4v12H4z" /><circle cx="12" cy="13" r="3.2" /></>,
    spark: <><path d="M12 2c.7 4.4 2.6 6.3 7 7-4.4.7-6.3 2.6-7 7-.7-4.4-2.6-6.3-7-7 4.4-.7 6.3-2.6 7-7Z" /><path d="M19 15c.3 1.8 1.2 2.7 3 3-1.8.3-2.7 1.2-3 3-.3-1.8-1.2-2.7-3-3 1.8-.3 2.7-1.2 3-3Z" /></>,
    cellar: <><path d="M5 20V7l7-4 7 4v13" /><path d="M8 20v-6h8v6M9 9h6" /></>,
  };
  return <svg className="marketing-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function AnimatedNumber({ value, prefix = "", suffix = "", locale }: { value: number; prefix?: string; suffix?: string; locale: Locale }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const element = ref.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let animationFrame = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      setDisplay(0);
      const startedAt = performance.now();
      const duration = 850;
      const tick = (now: number) => {
        const progress = Math.min((now - startedAt) / duration, 1);
        setDisplay(Math.round(value * (1 - (1 - progress) ** 3)));
        if (progress < 1) animationFrame = requestAnimationFrame(tick);
      };
      animationFrame = requestAnimationFrame(tick);
    }, { threshold: 0.6 });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(animationFrame);
    };
  }, [value]);

  return <span ref={ref}>{prefix}{new Intl.NumberFormat(locale === "it" ? "it-CH" : "en-CH").format(display)}{suffix}</span>;
}

export function ProductPreview({ copy, locale }: { copy: LandingCopy; locale: Locale }) {
  return (
    <div className="marketing-product-stage" aria-label={locale === "it" ? "Anteprima dell’interfaccia Vinaris" : "Preview of the Vinaris interface"}>
      <div className="marketing-product-glow" />
      <div className="marketing-product-dashboard">
        <header>
          <div><span>Dashboard</span><strong>Collector focus</strong></div>
          <div className="product-kpi"><span>{copy.insights.bottles}</span><strong><AnimatedNumber value={171} locale={locale} /></strong></div>
          <div className="product-kpi"><span>{copy.insights.ready}</span><strong><AnimatedNumber value={88} locale={locale} /></strong></div>
          <div className="product-kpi wide"><span>{copy.insights.value}</span><strong><AnimatedNumber value={9312} prefix="CHF " locale={locale} /></strong><i /></div>
        </header>
        <div className="product-dashboard-body">
          <section className="product-focus-card">
            <span>{locale === "it" ? "Posizione chiave" : "Key position"}</span>
            <div className="product-bottle" aria-hidden="true"><i /><b /></div>
            <div><small>{locale === "it" ? "Maggior incremento di valore" : "Largest price increase"}</small><strong>Ferrari Perlé</strong><p>Ferrari · Trento · 2018</p></div>
            <em>2018</em>
            <footer><span>{copy.maturity.ideal}</span><div><i /><b /></div><small>2018</small><small>2026</small><small>2031</small></footer>
          </section>
          <section className="product-action-card">
            <span>{locale === "it" ? "Azioni prioritarie" : "Priority actions"}</span>
            <strong>{copy.insights.ready}</strong>
            <b>88</b>
            <div><i /><span><strong>Carla</strong><small>Cadenazzi · 2023</small></span><em>2025–27</em></div>
            <div><i /><span><strong>Krug Grande Cuvée</strong><small>Champagne · NV</small></span><em>2027–38</em></div>
          </section>
        </div>
      </div>
      <article className="marketing-floating-ai">
        <LandingIcon name="spark" />
        <div><span>Sommelier</span><strong>{locale === "it" ? "3 vini adatti" : "3 suitable wines"}</strong></div>
      </article>
    </div>
  );
}

export function BottleJourneyVisual({ copy }: { copy: LandingCopy }) {
  return (
    <div className="marketing-capture-visual">
      <div className="capture-frame"><LandingIcon name="camera" /><span>{copy.journey.capture}</span><i /><i /><i /><i /></div>
      <div className="capture-connector"><span>01</span><i /><span>02</span></div>
      <article>
        <div className="capture-bottle" aria-hidden="true" />
        <div><small>{copy.journey.recognised}</small><strong>Brunello di Montalcino</strong><span>Fattoria La Gerla · 2016</span></div>
        <b>98%</b>
        <footer><span>{copy.journey.enriched}</span><i>✓</i></footer>
      </article>
    </div>
  );
}

export function MaturityVisual({ copy }: { copy: LandingCopy }) {
  return (
    <div className="marketing-window-card">
      <header><div><span>{copy.maturity.ideal}</span><strong>{copy.maturity.bottle}</strong></div><b>2028–2044</b></header>
      <div className="marketing-window-stages">{copy.maturity.stages.map((stage, index) => <span className={`stage-${index}`} key={stage}><i />{stage}</span>)}</div>
      <div className="marketing-window-chart">
        <svg viewBox="0 0 900 240" preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id="maturity-fill" x1="0" x2="1"><stop offset="0" stopColor="#c38a26" stopOpacity=".08" /><stop offset=".45" stopColor="#3b7a5b" stopOpacity=".22" /><stop offset="1" stopColor="#8b3348" stopOpacity=".12" /></linearGradient></defs>
          <path className="window-area" d="M20 206 C155 202 210 170 300 118 C410 50 560 46 675 91 C755 122 815 169 880 185 L880 220 L20 220Z" fill="url(#maturity-fill)" />
          <path className="window-line" d="M20 206 C155 202 210 170 300 118 C410 50 560 46 675 91 C755 122 815 169 880 185" />
        </svg>
        <i className="window-now"><b>2028</b></i><i className="window-peak"><b>{copy.maturity.peak}</b></i>
      </div>
      <footer><span>2023</span><strong>{copy.maturity.risk}: CHF 420</strong><span>2044</span></footer>
    </div>
  );
}

export function SommelierVisual({ copy }: { copy: LandingCopy }) {
  return (
    <div className="marketing-sommelier-console">
      <div className="sommelier-question"><span>{copy.sommelier.question}</span><i><LandingIcon name="spark" /></i></div>
      <div className="sommelier-answer"><small>Vinaris Sommelier</small><p>{copy.sommelier.answer}</p></div>
      <div className="sommelier-results">
        <article><i className="sommelier-bottle red" /><div><small>{copy.sommelier.cellarLabel}</small><strong>Barbaresco Basarin 2023</strong><span>{copy.sommelier.ready} · 2028–2044</span></div><b>01</b></article>
        <article><i className="sommelier-bottle gold" /><div><small>{copy.sommelier.alternative}</small><strong>Ferrari Perlé 2018</strong><span>{copy.sommelier.ready} · 2026–2031</span></div><b>02</b></article>
      </div>
    </div>
  );
}

export function InsightsVisual({ copy, locale }: { copy: LandingCopy; locale: Locale }) {
  return (
    <div className="marketing-insights-board">
      <div className="insights-kpis">
        <article><span>{copy.insights.bottles}</span><strong><AnimatedNumber value={171} locale={locale} /></strong><small>197 {locale === "it" ? "totali" : "total"}</small></article>
        <article><span>{copy.insights.value}</span><strong><AnimatedNumber value={9312} prefix="CHF " locale={locale} /></strong><small>+12.8%</small></article>
        <article><span>{copy.insights.ready}</span><strong><AnimatedNumber value={88} locale={locale} /></strong><small>CHF 3’383</small></article>
      </div>
      <article className="insights-growth"><header><span>{copy.insights.growth}</span><strong>+18.4%</strong></header><svg viewBox="0 0 600 180" preserveAspectRatio="none" aria-hidden="true"><path d="M0 152 C70 144 91 118 145 125 C205 132 220 92 280 100 C345 108 355 62 420 70 C485 78 520 34 600 24" /><path className="area" d="M0 152 C70 144 91 118 145 125 C205 132 220 92 280 100 C345 108 355 62 420 70 C485 78 520 34 600 24 L600 180 L0 180Z" /></svg><footer><span>2024</span><span>2025</span><span>2026</span></footer></article>
      <article className="insights-regions"><header><span>{copy.insights.regions}</span><strong>62%</strong></header>{copy.insights.regionNames.map((region, index) => <div key={region}><span>{region}</span><i><b style={{ width: `${[82, 64, 48][index]}%` }} /></i><strong>{[42, 31, 25][index]}</strong></div>)}</article>
      <article className="insights-deliveries"><span>{copy.insights.deliveries}</span><strong>4</strong><div><i />Château Cos d’Estournel <b>57d</b></div><div><i />Testamatta <b>{locale === "it" ? "Arrivo" : "Due"}</b></div></article>
    </div>
  );
}
