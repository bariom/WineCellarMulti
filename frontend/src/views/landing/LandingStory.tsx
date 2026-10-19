import type { CSSProperties, ReactNode } from "react";
import type { Locale } from "../../types";
import type { EssentialIcon, LandingStory, StoryFeatureId } from "./story";
import "./LandingStory.css";

const essentialPaths: Record<EssentialIcon, ReactNode> = {
  list: <path d="M4 6h16M4 12h16M4 18h10" />,
  pin: <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  window: <><path d="M3 17c4-8 14-8 18 0" /><circle cx="12" cy="10" r="1.6" /></>,
  trend: <path d="M4 18l5-6 4 3 7-9" />,
  camera: <><rect x="4" y="6" width="16" height="13" rx="2" /><circle cx="12" cy="12.5" r="3.5" /><path d="M9 6l1.5-2h3L15 6" /></>,
  note: <path d="M5 4h14v16l-7-4-7 4z" />,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  truck: <><rect x="3" y="7" width="13" height="10" rx="1" /><path d="M16 10h3l2 3v4h-5" /><circle cx="7" cy="18" r="1.6" /><circle cx="18" cy="18" r="1.6" /></>,
  filter: <path d="M4 5h16l-6 8v5l-4 2v-7z" />,
  import: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  house: <><path d="M3 20V9l9-5 9 5v11" /><path d="M8 20v-6h8v6" /></>,
  devices: <><rect x="3" y="5" width="13" height="10" rx="1.5" /><rect x="15" y="9" width="6" height="11" rx="1.5" /></>,
};

function Glass({ tone }: { tone: string }) {
  return <svg className="story-glass" viewBox="0 0 40 60" aria-hidden="true">
    <path d="M9 4h22c1 9-1 18-11 21C10 22 8 13 9 4z" className="story-glass-bowl" />
    <path d="M9.6 11h20.8c-.3 6.6-3.2 11.5-10.4 13.4C12.8 22.5 9.9 17.6 9.6 11z" style={{ fill: tone }} />
    <path d="M20 25v24M13 54h14" className="story-glass-stem" />
  </svg>;
}

/** Illustrative phone showing the cellar list as it looks in the app. */
export function HeroPhone({ story }: { story: LandingStory }) {
  const { phone } = story;
  return <div className="story-phone" role="img" aria-label={phone.label}>
    <div className="story-phone-screen">
      <div className="story-phone-head"><small>VINARIS</small><strong>{phone.title}</strong><span>{phone.summary}</span></div>
      <div className="story-phone-list">
        {phone.rows.map((row) => <div className="story-row" key={row.name} style={{ "--tone": row.tone } as CSSProperties}>
          <Glass tone={row.tone} />
          <div className="story-row-name"><b>{row.name}</b><span className="story-vintage">{row.vintage}</span></div>
          <div className="story-row-value"><b>{row.value}</b><small>{phone.perBottle}</small></div>
          <div className="story-row-meta">{row.producer} · {phone.bottles(row.count)}</div>
          <div className="story-row-window">
            <div className="story-years"><span>{row.years[0]}</span><b>{row.years[1]}</b><span>{row.years[2]}</span></div>
            <div className="story-bar"><i style={{ left: `${row.peak[0]}%`, width: `${row.peak[1]}%` }} /><b style={{ left: `${row.today}%` }} /></div>
            <span className={`story-phase is-${row.phaseTone}`}>{row.phase}</span>
          </div>
        </div>)}
      </div>
    </div>
  </div>;
}

export function StoryPillars({ story }: { story: LandingStory }) {
  return <section id="features" className="story-section story-pillars" aria-labelledby="pillars-title">
    <p className="story-kicker">{story.pillars.eyebrow}</p>
    <h2 id="pillars-title">{story.pillars.title}</h2>
    <div className="story-pillar-grid">
      {story.pillars.items.map((item, index) => <article key={item.title}>
        <span className="story-num" aria-hidden="true">0{index + 1}</span>
        <h3>{item.title}</h3>
        <p>{item.body}</p>
        <span className="story-chip">{item.chip}</span>
      </article>)}
    </div>
  </section>;
}

export function StoryEssentials({ story, onRegister }: { story: LandingStory; onRegister: () => void }) {
  const { essentials } = story;
  return <section className="story-band story-essentials" aria-labelledby="essentials-title">
    <div className="story-section">
      <div className="story-split-head">
        <div><p className="story-kicker">{essentials.eyebrow}</p><h2 id="essentials-title">{essentials.title}</h2></div>
        <p className="story-lead">{essentials.body}</p>
      </div>
      <ul className="story-essential-grid">
        {essentials.items.map((item) => <li key={item.title}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{essentialPaths[item.icon]}</svg>
          <b>{item.title}</b><span>{item.body}</span>
        </li>)}
      </ul>
      <div className="story-switch">
        <p><b>{essentials.switchTitle}</b> {essentials.switchBody}</p>
        <button type="button" className="marketing-button secondary compact" onClick={onRegister}>{essentials.switchAction}</button>
      </div>
    </div>
  </section>;
}

// A stylised shop shelf as the camera sees it, with the three best buys circled
// the way the shelf scanner marks them on the user's own photo.
const SHELF_GLASS = ["#2f3d27", "#4a1f26", "#1f2a23", "#6b5a2c", "#3a2a1d", "#22301f", "#5a2330"];
const SHELF_LABELS = ["#f3ecdd", "#e6d6b2", "#faf6ee", "#d7c39a", "#2a2320", "#efe3c8"];
const SHELF_PICKS = [{ row: 0, slot: 3, color: "#d8b366" }, { row: 1, slot: 7, color: "#c9ced4" }, { row: 2, slot: 2, color: "#c4874f" }];

function ShelfIllustration({ label }: { label: string }) {
  const rows = [74, 151, 228];
  const bottle = (row: number, slot: number) => ({ x: 14 + slot * 25, bottom: rows[row] - 4 });
  return <svg className="story-shelf-photo" viewBox="0 0 300 236" role="img" aria-label={label}>
    <defs>
      <linearGradient id="story-shelf-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2a1c16" /><stop offset="1" stopColor="#140d0a" /></linearGradient>
      <linearGradient id="story-shelf-glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity=".18" /><stop offset=".35" stopColor="#fff" stopOpacity="0" /></linearGradient>
      <filter id="story-shelf-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" /></filter>
    </defs>
    <rect width="300" height="236" rx="14" fill="url(#story-shelf-wall)" />
    {rows.map((rowY, row) => <g key={rowY}>
      {Array.from({ length: 11 }, (_, slot) => {
        const { x, bottom } = bottle(row, slot);
        const glass = SHELF_GLASS[(row * 5 + slot * 3) % SHELF_GLASS.length];
        const paper = SHELF_LABELS[(row * 2 + slot) % SHELF_LABELS.length];
        return <g key={slot}>
          <rect x={x + 7} y={bottom - 63} width="6" height="13" rx="2" fill={glass} />
          <rect x={x + 6.5} y={bottom - 66} width="7" height="5" rx="1.5" fill={slot % 3 ? "#8a1f2c" : "#c9a54e"} />
          <path d={`M${x + 7} ${bottom - 52} Q${x} ${bottom - 48} ${x} ${bottom - 40} V${bottom - 2} Q${x} ${bottom} ${x + 2} ${bottom} H${x + 18} Q${x + 20} ${bottom} ${x + 20} ${bottom - 2} V${bottom - 40} Q${x + 20} ${bottom - 48} ${x + 13} ${bottom - 52} Z`} fill={glass} />
          <rect x={x + 2.5} y={bottom - 32} width="15" height="17" rx="1.5" fill={paper} />
          <rect x={x + 5} y={bottom - 27} width="10" height="2" rx="1" fill={paper === "#2a2320" ? "#c9a54e" : "#7a5a3a"} opacity=".7" />
          <rect x={x + 6} y={bottom - 22} width="8" height="1.6" rx=".8" fill={paper === "#2a2320" ? "#efe3c8" : "#9b8a72"} opacity=".6" />
          <rect x={x + 2} y={bottom - 50} width="5" height="46" rx="2.5" fill="url(#story-shelf-glass)" />
        </g>;
      })}
      <rect x="6" y={rowY - 4} width="288" height="7" rx="2" fill="#5b3d28" />
      <rect x="6" y={rowY + 3} width="288" height="3" fill="#2b1a11" />
    </g>)}
    <g className="story-shelf-viewfinder" fill="none" stroke="#fff" strokeOpacity=".75" strokeWidth="2" strokeLinecap="round">
      <path d="M16 30V16H30" /><path d="M270 16H284V30" /><path d="M16 206V220H30" /><path d="M270 220H284V206" />
    </g>
    {SHELF_PICKS.map(({ row, slot, color }, index) => {
      const { x, bottom } = bottle(row, slot);
      const cx = x + 10;
      const cy = bottom - 28;
      return <g key={index}>
        <circle cx={cx} cy={cy} r="21" fill="none" stroke={color} strokeWidth="6" opacity=".55" filter="url(#story-shelf-glow)" />
        <circle cx={cx} cy={cy} r="20" fill={color} fillOpacity=".12" stroke={color} strokeWidth="2.5" />
        <circle cx={cx + 15} cy={cy - 17} r="8.5" fill={color} stroke="#140d0a" strokeWidth="1.5" />
        <text x={cx + 15} y={cy - 13.6} textAnchor="middle" fontSize="10" fontWeight="800" fill="#1b1310">{index + 1}</text>
      </g>;
    })}
  </svg>;
}

function FeatureVisual({ id, story, locale }: { id: StoryFeatureId; story: LandingStory; locale: Locale }) {
  const v = story.visuals;
  if (id === "shelf") return <div className="story-visual story-shelf">
    <ShelfIllustration label={v.shelf.alt} />
    <div className="story-shelf-ranking" aria-hidden="true">
      <div className="story-shelf-head"><b>{v.shelf.label}</b><span>{v.shelf.caption}</span></div>
      {v.shelf.picks.map((pick, index) => <div className={`story-shelf-pick is-${index + 1}`} key={pick.name}>
        <i>{index + 1}</i>
        <div><strong>{pick.name}</strong><span>{pick.meta}</span>{pick.note ? <em>{pick.note}</em> : null}</div>
        <b>{pick.price}</b>
      </div>)}
    </div>
  </div>;
  if (id === "scan") return <div className="story-visual story-scan" aria-hidden="true">
    <div className="story-receipt"><b>{v.scan.shop}</b>{v.scan.lines.map((line) => <span key={line}>{line}</span>)}<hr />{v.scan.total}</div>
    <span className="story-arrow">→</span>
    <div className="story-parsed">
      {v.scan.rows.map((row) => <div key={row.name}><strong>{row.name}</strong><em>{row.count}</em><span>{row.price}</span>{row.note ? <span className="story-ok">{row.note}</span> : null}</div>)}
      <span className="story-confirm">{v.scan.confirm}</span>
    </div>
  </div>;
  if (id === "sommelier") return <div className="story-visual story-chat" aria-hidden="true">
    <div className="story-bubble is-me">{v.sommelier.question}</div>
    <div className="story-bubble is-ai"><small>{v.sommelier.label}</small>{v.sommelier.answer}</div>
    {v.sommelier.picks.map((pick) => <div className="story-pick" key={pick.name}><i style={{ background: pick.tone }} /><div><b>{pick.name}</b><span>{pick.place}</span></div><em>{pick.window}</em></div>)}
  </div>;
  if (id === "taste") return <div className="story-visual story-taste" aria-hidden="true">
    <svg viewBox="0 0 200 200">
      <g className="story-radar-grid"><polygon points="100,20 169,60 169,140 100,180 31,140 31,60" /><polygon points="100,50 143,75 143,125 100,150 57,125 57,75" /><path d="M100 20V180M31 60L169 140M169 60L31 140" /></g>
      <polygon className="story-radar-shape" points="100,36 158,68 150,132 100,158 50,128 54,72" />
      <g className="story-radar-labels" textAnchor="middle">
        <text x="100" y="12">{v.taste.axes[0]}</text><text x="182" y="56">{v.taste.axes[1]}</text><text x="182" y="154">{v.taste.axes[2]}</text>
        <text x="100" y="196">{v.taste.axes[3]}</text><text x="18" y="154">{v.taste.axes[4]}</text><text x="18" y="56">{v.taste.axes[5]}</text>
      </g>
    </svg>
    <div><h4>{v.taste.title}</h4><div className="story-matches">{v.taste.matches.map((match) => <div key={match.name}><b>{match.name}</b><em>{match.score}</em></div>)}</div></div>
  </div>;
  if (id === "memories") {
    const photos = ["/images/home-tasting-v1.jpg", "/images/home-evening-tasting-v1.jpg", "/images/home-vineyard-v1.jpg"];
    return <div className="story-visual story-memories" aria-hidden="true">
      {v.memories.map((memory, index) => <div className={`story-polaroid is-${index + 1}`} key={memory.title}>
        <img src={photos[index]} alt="" loading="lazy" decoding="async" />
        <p>{memory.title}</p><small>{memory.meta}</small>
      </div>)}
    </div>;
  }
  if (id === "ownership") return <div className="story-visual story-ownership" aria-hidden="true">
    <div className="story-own-head"><b>{v.ownership.title}</b><span>{v.ownership.owners}</span></div>
    <div className="story-share">{v.ownership.people.map((person) => <i key={person.name} style={{ flexGrow: person.share, background: person.tone }} />)}</div>
    <div className="story-people">{v.ownership.people.map((person) => <div key={person.name}>
      <span style={{ background: person.tone }}>{person.initials}</span><div>{person.name}<small>{person.bottles}</small></div><em>{person.share}%</em>
    </div>)}</div>
  </div>;
  return <div className="story-visual story-restaurant">
    <img src={locale === "it" ? "/landing/restaurant-dashboard-preview.png" : "/landing/restaurant-dashboard-preview-en.png"} alt={v.restaurantAlt} loading="lazy" decoding="async" />
  </div>;
}

export function StoryBeyond({ story, locale, restaurantExtra }: { story: LandingStory; locale: Locale; restaurantExtra?: ReactNode }) {
  const { beyond } = story;
  return <section id="why" className="story-section story-beyond" aria-labelledby="beyond-title">
    <div className="story-beyond-head">
      <p className="story-kicker">{beyond.eyebrow}</p>
      <h2 id="beyond-title">{beyond.title} <em>{beyond.titleAccent}</em></h2>
      <p className="story-lead">{beyond.body}</p>
    </div>
    {beyond.features.map((feature, index) => <article key={feature.id} className={`story-feature${index % 2 ? " is-flipped" : ""}`} aria-labelledby={`feature-${feature.id}`}>
      <div className="story-feature-copy">
        <span className="story-tag">{feature.tag}</span>
        <h3 id={`feature-${feature.id}`}>{feature.title}</h3>
        <p>{feature.body}</p>
        <ul>{feature.points.map((point) => <li key={point}>{point}</li>)}</ul>
        {feature.id === "restaurant" ? restaurantExtra : null}
      </div>
      <FeatureVisual id={feature.id} story={story} locale={locale} />
    </article>)}
    <div className="story-more">
      <h3>{beyond.moreTitle}</h3>
      <div className="story-more-grid">{beyond.more.map((item) => <div key={item.title}><b>{item.title}</b><span>{item.body}</span></div>)}</div>
    </div>
  </section>;
}
