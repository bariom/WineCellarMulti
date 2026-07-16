import type { Locale, ViewName } from "../types";

export type HelpRole = "owner" | "admin" | "member" | "viewer";
export type HelpCategory = "getting-started" | "cellar" | "decisions" | "sharing" | "account" | "troubleshooting";

export type HelpArticle = {
  id: string;
  slug: string;
  locale: Locale;
  title: string;
  summary: string;
  keywords: string[];
  category: HelpCategory;
  roles: HelpRole[];
  relatedViews: Exclude<ViewName, "help">[];
  steps: string[];
  warnings: string[];
  relatedArticles: string[];
  updatedAt: string;
  searchText: string;
};

export type HelpArticleCopy = Omit<HelpArticle, "locale" | "searchText">;
