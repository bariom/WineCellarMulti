import { useId } from "react";

/** Vector light and flowing wine: no canvas, backdrop blur or animated filters. */
export function AiGenerationVisual() {
  const id = useId().replace(/:/g, "");
  const paint = (name: string) => `url(#${id}-${name})`;
  return <div className="ai-generation-stage" aria-hidden="true">
    <svg className="ai-generation-art" viewBox="0 0 1000 520" focusable="false">
      <defs>
        <clipPath id={`${id}-bowl`}>
          <path d="M463 183 H537 C542 198 547 221 544 241 C541 265 524 281 500 283 C476 281 459 265 456 241 C453 221 458 198 463 183Z" />
        </clipPath>
        <radialGradient id={`${id}-aura`}>
          <stop stopColor="#d2d9ac" stopOpacity=".3" />
          <stop offset=".5" stopColor="#7bbda3" stopOpacity=".12" />
          <stop offset="1" stopColor="#678d79" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-sphere`} cx="40%" cy="28%" r="78%">
          <stop stopColor="#678b76" /><stop offset=".48" stopColor="#234b40" /><stop offset="1" stopColor="#081d1b" />
        </radialGradient>
        <radialGradient id={`${id}-light`}>
          <stop stopColor="#fff4cd" stopOpacity=".48" /><stop offset=".35" stopColor="#dfbc86" stopOpacity=".22" /><stop offset="1" stopColor="#dfbc86" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-gold`} x1="0" y1="1" x2="1" y2="0">
          <stop stopColor="#b68b55" stopOpacity=".12" /><stop offset=".38" stopColor="#d6ac75" /><stop offset=".62" stopColor="#fff0bd" /><stop offset="1" stopColor="#d6ac75" stopOpacity=".18" />
        </linearGradient>
        <linearGradient id={`${id}-rose`}>
          <stop stopColor="#c78399" stopOpacity="0" /><stop offset=".45" stopColor="#e8a8b8" /><stop offset="1" stopColor="#a15072" stopOpacity=".15" />
        </linearGradient>
        <linearGradient id={`${id}-sage`}>
          <stop stopColor="#77b6a6" stopOpacity=".12" /><stop offset=".55" stopColor="#a8e0cd" /><stop offset="1" stopColor="#77b6a6" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fff3d4" /><stop offset=".5" stopColor="#c2e0c9" stopOpacity=".8" /><stop offset="1" stopColor="#f0d6a5" />
        </linearGradient>
        <linearGradient id={`${id}-wine`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#e2a4aa" stopOpacity=".8" /><stop offset=".35" stopColor="#b36783" stopOpacity=".8" /><stop offset="1" stopColor="#6c2949" stopOpacity=".95" />
        </linearGradient>
      </defs>

      <circle className="ai-generation-aura" cx="500" cy="260" r="255" fill={paint("aura")} />
      <g className="ai-generation-constellation" fill="none" stroke="#a0b9ab" strokeWidth=".7">
        <path d="M65 218 153 166 247 194 310 139 M690 380 766 327 850 352 949 282" opacity=".18" />
        <path d="M107 346 211 309 M784 143 894 185" opacity=".12" />
        {[[65, 218], [153, 166], [247, 194], [310, 139], [690, 380], [766, 327], [850, 352], [949, 282], [107, 346], [211, 309], [784, 143], [894, 185]].map(([cx, cy], index) =>
          <circle key={index} className="ai-generation-star" cx={cx} cy={cy} r={index % 3 === 0 ? 2.5 : 1.5} fill="#d7ceb2" stroke="none" opacity={index % 3 === 0 ? ".65" : ".3"} />)}
      </g>

      <g fill="none" strokeLinecap="round">
        <g className="ai-generation-ribbon-guides" strokeWidth=".8" opacity=".25">
          <path stroke={paint("gold")} d="M-30 290 C110 340 192 120 342 199 S560 375 674 281 838 150 1030 224" />
          <path stroke={paint("rose")} d="M-30 242 C125 164 235 360 376 278 S581 128 703 228 870 325 1030 278" />
          <path stroke={paint("sage")} d="M-30 264 C136 335 215 197 358 240 S559 360 698 245 848 202 1030 244" />
        </g>
        <path className="ai-generation-ribbon ribbon-gold" stroke={paint("gold")} d="M-30 290 C110 340 192 120 342 199 S560 375 674 281 838 150 1030 224" />
        <path className="ai-generation-ribbon ribbon-rose" stroke={paint("rose")} d="M-30 242 C125 164 235 360 376 278 S581 128 703 228 870 325 1030 278" />
        <path className="ai-generation-ribbon ribbon-sage" stroke={paint("sage")} d="M-30 264 C136 335 215 197 358 240 S559 360 698 245 848 202 1030 244" />
      </g>

      <g className="ai-generation-dial" fill="none" stroke="#dcc49a">
        <circle cx="500" cy="260" r="174" opacity=".11" />
        <circle cx="500" cy="260" r="163" strokeDasharray="1 15" opacity=".3" />
        <path d="M500 76v9 M500 435v9 M316 260h9 M675 260h9" opacity=".5" />
      </g>
      <g className="ai-generation-halo" fill="none" strokeLinecap="round">
        <circle cx="500" cy="260" r="146" stroke="#efca8e" strokeWidth="10" strokeDasharray="18 82" pathLength="100" opacity=".09" />
        <circle cx="500" cy="260" r="146" stroke="#efca8e" strokeWidth="1.8" strokeDasharray="18 82" pathLength="100" opacity=".85" />
        <circle cx="500" cy="260" r="146" stroke="#fff2c4" strokeWidth="2.6" strokeDasharray="4 96" pathLength="100" />
      </g>
      <g className="ai-generation-sphere">
        <circle cx="500" cy="260" r="133" fill={paint("sphere")} stroke={paint("glass")} strokeWidth=".8" />
        <circle className="ai-generation-sphere-light" cx="500" cy="251" r="126" fill={paint("light")} />
        <path d="M395 205 A119 119 0 0 1 544 149" fill="none" stroke="#d9e6ce" strokeOpacity=".35" strokeWidth="1.2" />
        <path d="M554 369 A119 119 0 0 0 608 309" fill="none" stroke="#91b7a8" strokeOpacity=".23" />
      </g>

      <g className="ai-generation-glass" strokeLinecap="round" strokeLinejoin="round">
        <g clipPath={paint("bowl")}>
          <g className="ai-generation-wine">
            <path d="M432 225 Q466 213 500 225 T568 225 V315 H432Z" fill={paint("wine")} />
            <ellipse cx="500" cy="225" rx="66" ry="8" fill="#efb3be" fillOpacity=".16" />
            <path d="M432 225 Q466 213 500 225 T568 225" fill="none" stroke="#efb3be" strokeOpacity=".85" strokeWidth="1.5" />
            <ellipse className="ai-generation-wine-current" cx="500" cy="236" rx="39" ry="11" fill="none" stroke="#f6c4cb" strokeOpacity=".4" strokeWidth="1.2" pathLength="100" />
          </g>
        </g>
        <path d="M463 183 H537 C542 198 547 221 544 241 C541 265 524 281 500 283 C476 281 459 265 456 241 C453 221 458 198 463 183Z M500 283V337 M474 339 Q500 333 526 339" fill="none" stroke={paint("glass")} strokeWidth="2.2" />
        <path d="M466 198 Q459 227 465 244" fill="none" stroke="#fff4d9" strokeOpacity=".38" strokeWidth="2" />
        <ellipse cx="500" cy="183" rx="37" ry="4" fill="none" stroke="#fff0d0" strokeOpacity=".32" />
      </g>

      <g fill="none" strokeLinecap="round">
        <g transform="translate(500 260) rotate(-28)">
          <ellipse rx="221" ry="68" stroke={paint("gold")} strokeWidth=".8" opacity=".65" />
          <ellipse className="ai-generation-orbit-trail trail-gold trail-glow" rx="221" ry="68" stroke="#efca8e" strokeWidth="14" pathLength="100" />
          <ellipse className="ai-generation-orbit-trail trail-gold" rx="221" ry="68" stroke={paint("gold")} strokeWidth="2.8" pathLength="100" />
          <ellipse className="ai-generation-orbit-trail trail-gold trail-point" rx="221" ry="68" stroke="#fff2c4" strokeWidth="4" pathLength="100" />
          <ellipse className="ai-generation-orbit-trail trail-gold trail-point trail-spark" rx="221" ry="68" stroke="#fff8e1" strokeWidth="7" pathLength="100" />
        </g>
        <g transform="translate(500 260) rotate(35)">
          <ellipse rx="202" ry="79" stroke={paint("sage")} strokeWidth=".7" opacity=".55" />
          <ellipse className="ai-generation-orbit-trail trail-sage trail-glow" rx="202" ry="79" stroke="#a8e0cd" strokeWidth="12" pathLength="100" />
          <ellipse className="ai-generation-orbit-trail trail-sage" rx="202" ry="79" stroke={paint("sage")} strokeWidth="1.8" pathLength="100" />
          <ellipse className="ai-generation-orbit-trail trail-sage trail-point" rx="202" ry="79" stroke="#ceffe8" strokeWidth="3.5" pathLength="100" />
          <ellipse className="ai-generation-orbit-trail trail-sage trail-point trail-spark" rx="202" ry="79" stroke="#eafff5" strokeWidth="6" pathLength="100" />
        </g>
        <g transform="translate(500 260) rotate(-67)">
          <ellipse className="ai-generation-orbit-trail trail-rose" rx="173" ry="103" stroke={paint("rose")} strokeWidth="1.2" pathLength="100" />
        </g>
      </g>
      <g className="ai-generation-glints" fill="#f9e9bf">
        <path className="ai-generation-glint" d="M660 160l2.5 7.5 7.5 2.5-7.5 2.5-2.5 7.5-2.5-7.5-7.5-2.5 7.5-2.5Z" />
        <path className="ai-generation-glint" d="M352 334l1.8 5.4 5.4 1.8-5.4 1.8-1.8 5.4-1.8-5.4-5.4-1.8 5.4-1.8Z" />
        <path className="ai-generation-glint" d="M618 372l1.4 4.2 4.2 1.4-4.2 1.4-1.4 4.2-1.4-4.2-4.2-1.4 4.2-1.4Z" />
        <circle className="ai-generation-glint" cx="369" cy="357" r="2.2" /><circle className="ai-generation-glint" cx="608" cy="381" r="1.4" />
      </g>
    </svg>
  </div>;
}
