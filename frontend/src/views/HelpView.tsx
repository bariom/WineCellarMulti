import type { Locale } from "../types";
import { helpGuideContentV2 } from "./helpContent";
import "./HelpView.css";

function parseHelpBullet(value: string) {
  const marker = "[AI] ";
  return value.startsWith(marker)
    ? { isAi: true, text: value.slice(marker.length) }
    : { isAi: false, text: value };
}

export default function HelpView({ locale }: { locale: Locale }) {
  const helpGuide = helpGuideContentV2[locale];
  return (
    <section className="help-center">
      <div className="help-hero">
        <p className="eyebrow">{helpGuide.eyebrow}</p>
        <h2>{helpGuide.title}</h2>
        <p>{helpGuide.intro}</p>
      </div>
      <div className="help-grid">
        {helpGuide.sections.map((section) => (
          <article className="help-card" key={section.title}>
            <h3>{section.title}</h3>
            <p>{section.body}</p>
            <ul>
              {section.bullets.map((bullet) => {
                const parsedBullet = parseHelpBullet(bullet);
                return (
                  <li key={bullet}>
                    {parsedBullet.isAi ? <span className="help-ai-badge">AI</span> : null}
                    <span>{parsedBullet.text}</span>
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
