import type MarkdownIt from 'markdown-it';

interface TableRange {
  from: number;
  to: number;
}

interface ReferenceSnapshot {
  source: string;
  environment: MarkdownIt.Env;
  tables: TableRange[];
}

// One snapshot per live editor. Only parser-confirmed, independently bounded
// tables whose rows start with '|' in column zero qualify for edit reuse.
const snapshots = new WeakMap<object, ReferenceSnapshot>();

const lineOffsets = (source: string): number[] => {
  const offsets = [0];
  let newline = source.indexOf('\n');
  while (newline !== -1) {
    offsets.push(newline + 1);
    newline = source.indexOf('\n', newline + 1);
  }
  return offsets;
};

const hasUnindentedPipeRows = (
  source: string,
  from: number,
  to: number,
): boolean => {
  let line = from;
  while (line < to) {
    if (source[line] !== '|') {
      return false;
    }
    const newline = source.indexOf('\n', line);
    if (newline === -1) {
      return true;
    }
    line = newline + 1;
  }
  return true;
};

const parseSnapshot = (
  markdown: MarkdownIt.MarkdownIt,
  source: string,
): ReferenceSnapshot => {
  const environment: MarkdownIt.Env = {};
  const tokens: MarkdownIt.Token[] = [];
  markdown.block.parse(source, markdown, environment, tokens);
  const offsets = lineOffsets(source);
  const tables: TableRange[] = [];
  for (const token of tokens) {
    if (token.type !== 'table_open' || token.level !== 0 || !token.map) {
      continue;
    }
    const from = offsets[token.map[0]];
    const to = offsets[token.map[1]] ?? source.length;
    const newline = source.indexOf('\n', to);
    const followingLine = source.slice(
      to,
      newline === -1 ? source.length : newline,
    );
    // A retained blank line or EOF prevents the table from swallowing later
    // blocks when edited. Other table endings conservatively require a reparse.
    // A standalone indented table may join a preceding list in the full note.
    // Requiring every row to begin with '|' keeps that context unchanged.
    if (
      /^[ \t]*$/.test(followingLine) &&
      hasUnindentedPipeRows(source, from, to)
    ) {
      tables.push({ from, to });
    }
  }
  return { source, environment, tables };
};

const firstDifference = (before: string, after: string): number => {
  const limit = Math.min(before.length, after.length);
  const chunk = 4096;
  let offset = 0;
  // Compare long unchanged prefixes in native string code, then inspect only
  // the final partial chunk. Tables can occur near the end of large notes.
  while (
    offset + chunk <= limit &&
    before.slice(offset, offset + chunk) === after.slice(offset, offset + chunk)
  ) {
    offset += chunk;
  }
  while (
    offset < limit &&
    before.charCodeAt(offset) === after.charCodeAt(offset)
  ) {
    offset++;
  }
  return offset;
};

const reuseTableEdit = (
  markdown: MarkdownIt.MarkdownIt,
  source: string,
  cached: ReferenceSnapshot,
): ReferenceSnapshot | undefined => {
  if (cached.tables.length === 0) {
    return undefined;
  }
  const changedFrom = firstDifference(cached.source, source);
  const table = cached.tables.find(
    (range) => range.from <= changedFrom && changedFrom <= range.to,
  );
  if (!table) {
    return undefined;
  }
  const delta = source.length - cached.source.length;
  const to = table.to + delta;
  if (to < table.from || cached.source.slice(table.to) !== source.slice(to)) {
    return undefined;
  }
  const fragment = source.slice(table.from, to);
  if (to < source.length && !fragment.endsWith('\n')) {
    return undefined;
  }
  // Validate in a separate environment: rejected fragments must never mutate
  // the cached definitions. A table must cover the entire changed fragment.
  const parsed = parseSnapshot(markdown, fragment);
  if (
    parsed.tables.length !== 1 ||
    parsed.tables[0].from !== 0 ||
    parsed.tables[0].to !== fragment.length ||
    parsed.environment.references !== undefined
  ) {
    return undefined;
  }
  const tables = cached.tables.map((range) => {
    if (range === table) {
      return { from: range.from, to };
    }
    return range.from >= table.to
      ? { from: range.from + delta, to: range.to + delta }
      : range;
  });
  return { source, environment: cached.environment, tables };
};

export const referenceEnvironment = (
  markdown: MarkdownIt.MarkdownIt,
  document: string,
  cacheKey?: object,
): MarkdownIt.Env => {
  // Normalize before computing ranges so CRLF and bare CR cannot invalidate
  // the parser's line-to-offset mapping.
  const source = document.replace(/\r\n?/g, '\n');
  const cached = cacheKey ? snapshots.get(cacheKey) : undefined;
  if (cached?.source === source) {
    return cached.environment;
  }
  const snapshot =
    (cached && reuseTableEdit(markdown, source, cached)) ||
    (source.includes(']:')
      ? parseSnapshot(markdown, source)
      : { source, environment: {}, tables: [] });
  if (cacheKey) {
    snapshots.set(cacheKey, snapshot);
  }
  return snapshot.environment;
};
