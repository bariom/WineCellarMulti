import type { ReactNode } from "react";

/**
 * The assistant's answer with the light formatting it writes: paragraphs,
 * "- " or "1. " lists and **bold**. Everything else stays plain text; no HTML
 * from the model is ever interpreted.
 */
export function AssistantAnswer({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) blocks.push(<p key={`p-${blocks.length}`}>{inline(paragraph.join(" "))}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item, index) => <li key={index}>{inline(item)}</li>);
    blocks.push(list.ordered ? <ol key={`l-${blocks.length}`}>{items}</ol> : <ul key={`l-${blocks.length}`}>{items}</ul>);
    list = null;
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    const bullet = line.match(/^[-•*]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flushList();
      list = list ?? { ordered, items: [] };
      list.items.push((bullet || numbered)![1]);
    } else if (!line) {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return <div className="assistant-answer">{blocks}</div>;
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => (
    part.startsWith("**") && part.endsWith("**") && part.length > 4
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part
  ));
}
