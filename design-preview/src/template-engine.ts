type Ctx = Record<string, unknown>;

function getValue(ctx: Ctx, path: string): unknown {
  return path.trim().split('.').reduce<unknown>((c, k) => {
    if (c != null && typeof c === 'object') return (c as Ctx)[k];
    return undefined;
  }, ctx);
}

/**
 * Find the matching close tag for a block, tracking nesting depth.
 * Returns the inner content and the position after the close tag.
 */
function findBlock(
  template: string,
  from: number,
  tag: string,
): { inner: string; after: number } {
  const openTag = `{{#${tag} `;
  const closeTag = `{{/${tag}}}`;

  let depth = 1;
  let pos = from;

  while (pos < template.length) {
    const nextOpen = template.indexOf(openTag, pos);
    const nextClose = template.indexOf(closeTag, pos);

    if (nextClose === -1) throw new Error(`Unclosed {{#${tag}}}`);

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + openTag.length;
    } else {
      depth--;
      if (depth === 0) {
        return {
          inner: template.slice(from, nextClose),
          after: nextClose + closeTag.length,
        };
      }
      pos = nextClose + closeTag.length;
    }
  }

  throw new Error(`Unclosed {{#${tag}}}`);
}

/**
 * Recursive descent template renderer.
 *
 * Supported syntax:
 *   {{variable}}         — variable substitution (dot-notation supported)
 *   {{#each items}}      — iterate over an array; inner variables access item fields
 *   {{/each}}
 *   {{#if field}}        — conditional; truthy check on a field
 *   {{/if}}
 *
 * Values are rendered as raw HTML (no escaping) to allow <br> etc.
 * Nested blocks are supported via recursive processing.
 */
export function renderTemplate(template: string, data: Ctx): string {
  return renderNode(template, data);
}

function renderNode(template: string, ctx: Ctx): string {
  const result: string[] = [];
  let i = 0;

  while (i < template.length) {
    const open = template.indexOf('{{', i);
    if (open === -1) {
      result.push(template.slice(i));
      break;
    }
    if (open > i) result.push(template.slice(i, open));

    const close = template.indexOf('}}', open + 2);
    if (close === -1) {
      result.push(template.slice(open));
      break;
    }

    const tag = template.slice(open + 2, close).trim();

    if (tag.startsWith('#each ')) {
      const path = tag.slice(6).trim();
      const { inner, after } = findBlock(template, close + 2, 'each');
      const arr = getValue(ctx, path);
      if (Array.isArray(arr)) {
        for (const item of arr) {
          const itemCtx =
            item != null && typeof item === 'object'
              ? { ...ctx, ...(item as Ctx) }
              : ctx;
          result.push(renderNode(inner, itemCtx));
        }
      }
      i = after;
    } else if (tag.startsWith('#if ')) {
      const path = tag.slice(4).trim();
      const { inner, after } = findBlock(template, close + 2, 'if');
      const val = getValue(ctx, path);
      if (val) result.push(renderNode(inner, ctx));
      i = after;
    } else if (tag.startsWith('/')) {
      // Stray close tag — skip (shouldn't happen in well-formed templates)
      i = close + 2;
    } else {
      // Variable substitution
      const val = getValue(ctx, tag);
      result.push(val != null ? String(val) : '');
      i = close + 2;
    }
  }

  return result.join('');
}
