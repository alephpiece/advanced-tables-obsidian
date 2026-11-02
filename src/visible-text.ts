import MarkdownIt from 'markdown-it';

// Parsing never renders HTML or resolves links. Unsupported embeds and math
// retain their source text because their displayed size is not a text width.
let parser: MarkdownIt.MarkdownIt | undefined;

const wikiDisplayText = (target: string): string => {
  const separator = target.indexOf('|');
  if (separator > 0) {
    return target.slice(separator + 1).trim();
  }
  // Obsidian keeps explicit paths and extensions in unaliased links and shows
  // heading/block subpaths with " > " separators, including same-note links.
  return target.split('#').filter(Boolean).join(' > ').trim();
};

const wikiLink = (state: MarkdownIt.StateInline, silent: boolean): boolean => {
  const start = state.pos;
  const embed = state.src.startsWith('![[', start);
  const open = start + (embed ? 1 : 0);
  if (!state.src.startsWith('[[', open)) {
    return false;
  }

  const end = state.src.indexOf(']]', open + 2);
  if (end === -1 || end + 2 > state.posMax) {
    return false;
  }
  const target = state.src.slice(open + 2, end);
  if (!target || /[\n\r\[\]]/.test(target)) {
    return false;
  }

  if (!silent) {
    const token = state.push('visible_text_literal', '', 0);
    token.content = embed
      ? state.src.slice(start, end + 2)
      : wikiDisplayText(target.replace(/\\\|/g, '|'));
  }
  state.pos = end + 2;
  return true;
};

const math = (state: MarkdownIt.StateInline, silent: boolean): boolean => {
  const start = state.pos;
  if (state.src[start] !== '$') {
    return false;
  }
  const marker = state.src.startsWith('$$', start) ? '$$' : '$';
  const inline = marker.length === 1;
  // Match Obsidian's inline math boundaries: no space/tab after the opening
  // dollar or before the closing dollar, and no digit after the closing one.
  if (inline && /[ \t]/.test(state.src.charAt(start + 1))) {
    return false;
  }
  let end = start + marker.length;
  while (end < state.posMax) {
    if (state.src[end] === '\\') {
      end += 2;
    } else if (
      end + marker.length <= state.posMax &&
      state.src.startsWith(marker, end) &&
      (!inline ||
        (!/[ \t]/.test(state.src.charAt(end - 1)) &&
          !/[0-9]/.test(state.src.charAt(end + 1))))
    ) {
      if (!silent) {
        const token = state.push('visible_text_literal', '', 0);
        token.content = state.src.slice(start, end + marker.length);
      }
      state.pos = end + marker.length;
      return true;
    } else {
      end++;
    }
  }
  return false;
};

// Use markdown-it's delimiter balancing so escaped, unmatched and nested marks
// behave like emphasis, without stripping equals signs in ordinary text.
const highlight = (state: MarkdownIt.StateInline, silent: boolean): boolean => {
  if (silent || !state.src.startsWith('==', state.pos)) {
    return false;
  }
  const scanned = state.scanDelims(state.pos, true);
  if (scanned.length !== 2) {
    return false;
  }
  const token = state.push('text', '', 0);
  token.content = '==';
  state.delimiters.push({
    marker: 0x3d,
    length: 0,
    token: state.tokens.length - 1,
    end: -1,
    open: scanned.can_open,
    close: scanned.can_close,
  });
  state.pos += 2;
  return true;
};

const balanceHighlight = (state: MarkdownIt.StateInline): void => {
  const lists = [state.delimiters];
  for (const meta of state.tokens_meta) {
    if (meta?.delimiters) {
      lists.push(meta.delimiters);
    }
  }
  for (const delimiters of lists) {
    for (const delimiter of delimiters) {
      if (delimiter.marker !== 0x3d || delimiter.end === -1) {
        continue;
      }
      const opening = state.tokens[delimiter.token];
      const closing = state.tokens[delimiters[delimiter.end].token];
      opening.type = 'mark_open';
      opening.nesting = 1;
      opening.content = '';
      closing.type = 'mark_close';
      closing.nesting = -1;
      closing.content = '';
    }
  }
};

const getParser = (): MarkdownIt.MarkdownIt => {
  if (!parser) {
    parser = new MarkdownIt({ html: true });
    parser.inline.ruler.before('link', 'visible_text_wiki_link', wikiLink);
    parser.inline.ruler.before('escape', 'visible_text_math', math);
    parser.inline.ruler.before('emphasis', 'visible_text_highlight', highlight);
    parser.inline.ruler2.before(
      'emphasis',
      'visible_text_highlight',
      balanceHighlight,
    );
  }
  return parser;
};

const tokensToText = (tokens: MarkdownIt.Token[]): string =>
  tokens
    .map((token) => {
      if (token.type === 'softbreak' || token.type === 'hardbreak') {
        return '\n';
      }
      if (
        token.type === 'html_inline' &&
        /^<br\s*\/?\s*>$/i.test(token.content)
      ) {
        return '\n';
      }
      if (token.nesting !== 0) {
        return '';
      }
      if (token.type === 'code_inline') {
        // Pipe tables consume one backslash before a pipe even inside code.
        // parseInline has no table context, so apply that step to code here.
        return token.content.replace(/\\\|/g, '|');
      }
      return token.content;
    })
    .join('');

/**
 * Projects Markdown source to estimated display text. Each displayed line is
 * kept separate so the formatter can measure the longest one using its own
 * Unicode width rules. The returned function caches cells during one action.
 */
export const createVisibleTextProjector = (
  getDocument: () => string = () => '',
): ((content: string) => string) => {
  let environment: MarkdownIt.Env | undefined;
  const cache = new Map<string, string>();

  return (content) => {
    const cached = cache.get(content);
    if (cached !== undefined) {
      return cached;
    }
    const markdown = getParser();
    let tokens =
      markdown.parseInline(content, environment ?? {})[0]?.children ?? [];
    // Without definitions, reference links leave '[' in ordinary text tokens.
    // Wiki links, inline links, code and math can be measured without reading
    // the whole note. Resolve references only when such text is encountered.
    if (
      environment === undefined &&
      tokens.some(
        (token) => token.type === 'text' && token.content.includes('['),
      )
    ) {
      environment = {};
      const document = getDocument().replace(/\r\n?/g, '\n');
      if (document.includes(']:')) {
        // The block parser collects definitions while respecting code fences;
        // it does not need to tokenize every other inline in the document.
        markdown.block.parse(document, markdown, environment, []);
        tokens = markdown.parseInline(content, environment)[0]?.children ?? [];
      }
    }
    // Image dimensions cannot be inferred from their alt text. Fall back for
    // the entire cell instead of pretending that its text is the image width.
    const visible = tokens.some((token) => token.type === 'image')
      ? content
      : tokensToText(tokens);
    cache.set(content, visible);
    return visible;
  };
};
