import type { Locale } from "../types";
import type { HelpArticle, HelpArticleCopy } from "./types";

export function createHelpArticles(locale: Locale, articles: HelpArticleCopy[]): HelpArticle[] {
  return articles.map((article) => ({
    ...article,
    locale,
    searchText: [article.title, article.summary, ...article.keywords, ...article.steps, ...article.warnings]
      .join(" ")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase(locale),
  }));
}

export function searchHelpArticles(articles: HelpArticle[], query: string): HelpArticle[] {
  const terms = query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return terms.length ? articles.filter((article) => terms.every((term) => article.searchText.includes(term))) : articles;
}
