/**
 * markdown.ts — dependency-free Markdown -> HTML for the /docs manuals.
 *
 * The app can't add npm deps (frozen lockfile), so this is a small, safe subset
 * renderer: headings, bold/italic, inline code, fenced code blocks, ordered /
 * unordered lists, blockquotes, horizontal rules, links, and paragraphs. All
 * text is HTML-escaped first, so raw HTML in the source is shown literally
 * (manuals are in-repo, but we escape defensively).
 */

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Inline: `code`, **bold**, *italic*, [text](url). Operates on escaped text.
 *  When `lang` is given, internal /docs links get `?lang=<lang>` appended so
 *  cross-links between manuals stay in the current language. */
function renderInline(text: string, lang?: string): string {
  // Protect inline code from the bold/italic/link rules with a printable token.
  const codeSlots: string[] = [];
  let out = text.replace(/`([^`]+)`/g, (_m, c) => {
    codeSlots.push(`<code>${c}</code>`);
    return `[[[code:${codeSlots.length - 1}]]]`;
  });
  out = out
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    // [text](url) — url already escaped; only allow http(s) / relative.
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
      let safe = /^(https?:|\/)/.test(url) ? url : "#";
      const ext = /^https?:/.test(safe);
      // Keep the current language when linking to another manual page.
      if (lang && /^\/docs(\/|$)/.test(safe) && !safe.includes("?")) {
        safe = `${safe}?lang=${lang}`;
      }
      return `<a href="${safe}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ""}>${label}</a>`;
    });
  return out.replace(
    /\[\[\[code:(\d+)\]\]\]/g,
    (_m, i) => codeSlots[Number(i)],
  );
}

/** Render a Markdown string to an HTML string. Pass `lang` to keep internal
 *  /docs cross-links in the current language. */
export function renderMarkdown(md: string, lang?: string): string {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;
  let listType: "ul" | "ol" | null = null;

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // fenced code block
    if (/^```/.test(line)) {
      closeList();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(escapeHtml(lines[i]));
        i++;
      }
      i++; // closing fence
      html.push(`<pre><code>${buf.join("\n")}</code></pre>`);
      continue;
    }

    // blank line
    if (/^\s*$/.test(line)) {
      closeList();
      i++;
      continue;
    }

    // horizontal rule
    if (/^\s*---+\s*$/.test(line)) {
      closeList();
      html.push("<hr />");
      i++;
      continue;
    }

    // heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      const level = h[1].length;
      html.push(
        `<h${level}>${renderInline(escapeHtml(h[2].trim()), lang)}</h${level}>`,
      );
      i++;
      continue;
    }

    // blockquote
    if (/^\s*>\s?/.test(line)) {
      closeList();
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(escapeHtml(lines[i].replace(/^\s*>\s?/, "")));
        i++;
      }
      html.push(
        `<blockquote>${renderInline(buf.join(" "), lang)}</blockquote>`,
      );
      continue;
    }

    // ordered list item
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${renderInline(escapeHtml(ol[1]), lang)}</li>`);
      i++;
      continue;
    }

    // unordered list item
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${renderInline(escapeHtml(ul[1]), lang)}</li>`);
      i++;
      continue;
    }

    // paragraph (gather consecutive non-empty, non-special lines)
    closeList();
    const buf: string[] = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*---+\s*$/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i])
    ) {
      buf.push(escapeHtml(lines[i]).trim());
      i++;
    }
    html.push(`<p>${renderInline(buf.join(" "), lang)}</p>`);
  }

  closeList();
  return html.join("\n");
}
