// Real-world proof for the landing page: the founder, customer quotes, usage
// figures and third-party mentions. Every slot is empty on purpose and the page
// renders nothing for an empty slot: only add entries that are real, with the
// person's consent, never placeholder or demo content.

export type LandingFounder = {
  name: string;
  /** Path under /public, e.g. "/images/founder.jpg". */
  photo: string;
  /** One line of cellar credibility, per language. */
  credential: { it: string; en: string };
  /** LinkedIn or X profile. */
  profileUrl: string;
  profileLabel: string;
};

export type LandingTestimonial = {
  /** What changed for them, in their words, per language. */
  quote: { it: string; en: string };
  firstName: string;
  /** e.g. "340 bottiglie" / "340 bottles". */
  cellar: { it: string; en: string };
  photo?: string;
};

export type LandingUsage = {
  /** e.g. { it: "12’400 bottiglie in 180 cantine", en: "12,400 bottles across 180 cellars" } */
  line: { it: string; en: string };
  /** Month the figure was last updated, e.g. "2026-11". */
  updated: string;
};

export type LandingPress = { source: string; date: string; quote: { it: string; en: string }; url: string };

export const landingProof: {
  founder: LandingFounder | null;
  usage: LandingUsage | null;
  testimonials: LandingTestimonial[];
  press: LandingPress[];
} = {
  founder: null,
  usage: null,
  testimonials: [],
  press: [],
};
