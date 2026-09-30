import { Marked } from "marked";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const isSafeUrl = (href: string) => /^(https?:|mailto:)/i.test(href.trim());

// Agent output is model-generated, so it's treated as untrusted: raw HTML is
// shown as text, only http(s)/mailto links are kept, and remote images are
// never loaded.
const marked = new Marked({
  gfm: true,
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
    link({ href, tokens }) {
      const text = this.parser.parseInline(tokens);
      if (!isSafeUrl(href)) return text;
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer nofollow">${text}</a>`;
    },
    image({ text }) {
      return escapeHtml(text);
    },
  },
});

export const renderMarkdown = (source: string | null | undefined) =>
  source ? (marked.parse(source, { async: false }) as string) : "";

// The opening of a Markdown document, cut at a paragraph break once it passes
// `limit` characters, so a long brief can be previewed without breaking it.
export const markdownExcerpt = (source: string, limit = 900) => {
  const blocks = source.trim().split(/\n\s*\n/);
  let text = blocks[0] ?? "";
  let used = 1;
  while (used < blocks.length && text.length + blocks[used].length <= limit) {
    text += `\n\n${blocks[used]}`;
    used++;
  }
  return { text, truncated: used < blocks.length };
};
