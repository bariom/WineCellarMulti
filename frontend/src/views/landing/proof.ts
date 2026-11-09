// Real-world proof for the public site: the founder, customer quotes, usage
// figures and third-party mentions. The data lives in proof.json, which also
// feeds the static pricing pages (scripts/generate_pricing_pages.py; rerun it
// after editing the file). Every slot is empty on purpose and the pages render
// nothing for an empty slot: only add entries that are real, with the person's
// consent, never placeholder or demo content.
import proofData from "./proof.json";

export type LandingFounder = {
  name: string;
  /** Path under /public, e.g. "/images/founder.jpg". */
  photo?: string;
  /** One line of cellar credibility, per language, e.g. "Collezionista di vino in Ticino". */
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

export type LandingProof = {
  founder: LandingFounder | null;
  usage: LandingUsage | null;
  testimonials: LandingTestimonial[];
  press: LandingPress[];
};

export const landingProof = proofData as LandingProof;
