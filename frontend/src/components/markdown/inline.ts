/**
 * Inline markdown → node tree.
 *
 * Emphasis is the whole reason this is a tokenizer rather than a regex split.
 * A pattern like /_(?!\s)[^_\n]+?_/ happily matches `_Support_` inside
 * `01_Support_Policy_v3_CURRENT.pdf` and silently eats the underscores, which
 * corrupts every filename, document name, and snake_case identifier the model
 * mentions.
 *
 * So delimiter runs are classified using CommonMark's left/right-flanking
 * rules, which encode exactly the intent "only treat `_` as emphasis when it is
 * actually being used as an emphasis delimiter":
 *
 *   - `_` cannot open or close emphasis inside a word, so every underscore in
 *     `01_Support_Policy_v3_CURRENT.pdf` stays literal text.
 *   - `_italic_` at a word boundary still works.
 *   - `*` keeps its CommonMark behaviour, where intraword emphasis is allowed.
 *
 * Matching then runs the standard delimiter-stack pass (including the "rule of
 * three"), which also gets nesting like `**bold _and italic_**` right.
 *
 * Everything here is pure — no React, no DOM — so it can be unit-tested
 * directly. See frontend/scripts/test-markdown.ts.
 */

/* -------------------------------------------------------------------- types */

export type InlineNode =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "emphasis"; children: InlineNode[] }
  | { type: "strong"; children: InlineNode[] }
  | { type: "strike"; children: InlineNode[] }
  | { type: "link"; href: string; children: InlineNode[] };

/** Only these schemes ever become real anchors. */
export const SAFE_HREF = /^(https?:\/\/|mailto:|\/)/i;

/* ------------------------------------------------------- character classes */

const ASCII_PUNCTUATION = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

/** CommonMark's notion of punctuation: ASCII punctuation plus Unicode P/S. */
const UNICODE_PUNCTUATION = /[\p{P}\p{S}]/u;

type CharClass = "space" | "punct" | "word";

/**
 * Classify the character next to a delimiter run. The start and end of the
 * string count as whitespace, which is what makes `_foo_` at the very edges of
 * a line behave like `_foo_` surrounded by spaces.
 */
function classify(char: string | undefined): CharClass {
  if (char === undefined) return "space";
  if (/\s/.test(char)) return "space";
  if (UNICODE_PUNCTUATION.test(char)) return "punct";
  return "word";
}

/* ------------------------------------------------------------ token stream */

interface TokenBase {
  prev: Token | null;
  next: Token | null;
}

interface TextToken extends TokenBase {
  kind: "text";
  value: string;
}

interface NodeToken extends TokenBase {
  kind: "node";
  node: InlineNode;
}

/** An unresolved run of `*`, `_`, or `~~`. */
interface DelimToken extends TokenBase {
  kind: "delim";
  char: string;
  /** Characters still available for matching; 0 once fully consumed. */
  count: number;
  /** Run length as written — the "rule of three" is defined on this. */
  original: number;
  canOpen: boolean;
  canClose: boolean;
}

type Token = TextToken | NodeToken | DelimToken;

/** Doubly-linked list with a sentinel head, so removal never needs a re-root. */
class TokenList {
  readonly head: TextToken = {
    kind: "text",
    value: "",
    prev: null,
    next: null,
  };

  private tail: Token = this.head;

  push(token: Token): void {
    token.prev = this.tail;
    token.next = null;
    this.tail.next = token;
    this.tail = token;
  }

  pushText(value: string): void {
    // Merge into the previous text token where possible: fewer nodes out, and
    // adjacent literals read as one string.
    if (this.tail.kind === "text" && this.tail !== this.head) {
      this.tail.value += value;
      return;
    }

    this.push({ kind: "text", value, prev: null, next: null });
  }

  remove(token: Token): void {
    if (token.prev) token.prev.next = token.next;
    if (token.next) token.next.prev = token.prev;
    if (this.tail === token) this.tail = token.prev ?? this.head;
  }
}

/* ---------------------------------------------------------------- scanning */

/**
 * Find the code span opened by the backtick run at `start`.
 *
 * Returns the span content and the index just past the closing run, or null
 * when the run is never closed (in which case the backticks are literal).
 */
function scanCodeSpan(
  text: string,
  start: number,
): { value: string; end: number } | null {
  let openEnd = start;
  while (text[openEnd] === "`") openEnd += 1;

  const runLength = openEnd - start;
  let cursor = openEnd;

  while (cursor < text.length) {
    if (text[cursor] !== "`") {
      cursor += 1;
      continue;
    }

    let closeEnd = cursor;
    while (text[closeEnd] === "`") closeEnd += 1;

    if (closeEnd - cursor === runLength) {
      let value = text.slice(openEnd, cursor).replace(/\n/g, " ");

      // CommonMark strips one space from each end of ` x `, which is how you
      // write a code span that itself starts or ends with a backtick.
      if (
        value.length > 2 &&
        value.startsWith(" ") &&
        value.endsWith(" ") &&
        value.trim() !== ""
      ) {
        value = value.slice(1, -1);
      }

      return { value, end: closeEnd };
    }

    cursor = closeEnd;
  }

  return null;
}

/**
 * Match a `[label](destination)` link starting at `start`.
 *
 * Brackets nest and backslash escapes are honoured, so
 * `[see [1]](https://example.com)` resolves the way a reader expects.
 */
function scanLink(
  text: string,
  start: number,
): { label: string; href: string; end: number } | null {
  let cursor = start + 1;
  let depth = 1;

  while (cursor < text.length && depth > 0) {
    const char = text[cursor];

    if (char === "\\") {
      cursor += 2;
      continue;
    }

    if (char === "[") depth += 1;
    else if (char === "]") depth -= 1;

    if (depth === 0) break;
    cursor += 1;
  }

  if (depth !== 0 || text[cursor + 1] !== "(") return null;

  const label = text.slice(start + 1, cursor);
  let hrefStart = cursor + 2;
  let hrefCursor = hrefStart;
  let parens = 1;

  while (hrefCursor < text.length && parens > 0) {
    const char = text[hrefCursor];

    if (char === "\\") {
      hrefCursor += 2;
      continue;
    }

    if (char === "(") parens += 1;
    else if (char === ")") parens -= 1;

    if (parens === 0) break;
    hrefCursor += 1;
  }

  if (parens !== 0) return null;

  const href = text.slice(hrefStart, hrefCursor).trim();

  // A destination with whitespace is a title or plain prose, not a link.
  if (!href || /\s/.test(href)) return null;

  return { label, href, end: hrefCursor + 1 };
}

/** Split the text into literals, resolved nodes, and unresolved delimiters. */
function tokenize(text: string): { tokens: TokenList; delims: DelimToken[] } {
  const tokens = new TokenList();
  const delims: DelimToken[] = [];

  let index = 0;
  let pending = "";

  const flush = () => {
    if (pending) {
      tokens.pushText(pending);
      pending = "";
    }
  };

  while (index < text.length) {
    const char = text[index];

    // Backslash escape — `\_` is a literal underscore, never a delimiter.
    if (char === "\\") {
      const next = text[index + 1];

      if (next !== undefined && ASCII_PUNCTUATION.includes(next)) {
        pending += next;
        index += 2;
        continue;
      }

      pending += char;
      index += 1;
      continue;
    }

    // Code spans bind tighter than emphasis, and their content is never parsed.
    if (char === "`") {
      const span = scanCodeSpan(text, index);

      if (span) {
        flush();
        tokens.push({
          kind: "node",
          node: { type: "code", value: span.value },
          prev: null,
          next: null,
        });
        index = span.end;
        continue;
      }

      pending += char;
      index += 1;
      continue;
    }

    if (char === "[") {
      const link = scanLink(text, index);

      if (link) {
        flush();

        if (SAFE_HREF.test(link.href)) {
          tokens.push({
            kind: "node",
            node: {
              type: "link",
              href: link.href,
              children: parseInline(link.label),
            },
            prev: null,
            next: null,
          });
        } else {
          // Unsupported scheme (javascript:, data:, …) — show the source text
          // rather than producing an anchor.
          tokens.pushText(text.slice(index, link.end));
        }

        index = link.end;
        continue;
      }

      pending += char;
      index += 1;
      continue;
    }

    if (char === "*" || char === "_" || char === "~") {
      let runEnd = index;
      while (text[runEnd] === char) runEnd += 1;

      const count = runEnd - index;

      // GFM strikethrough is `~~`; a lone `~` is just a tilde.
      if (char === "~" && count !== 2) {
        pending += char.repeat(count);
        index = runEnd;
        continue;
      }

      const before = classify(index > 0 ? text[index - 1] : undefined);
      const after = classify(runEnd < text.length ? text[runEnd] : undefined);

      const leftFlanking =
        after !== "space" &&
        (after !== "punct" || before === "space" || before === "punct");

      const rightFlanking =
        before !== "space" &&
        (before !== "punct" || after === "space" || after === "punct");

      // The `_` branch is the filename fix: intraword underscores are both
      // left- and right-flanking, which disqualifies them from opening or
      // closing emphasis.
      const canOpen =
        char === "_"
          ? leftFlanking && (!rightFlanking || before === "punct")
          : leftFlanking;

      const canClose =
        char === "_"
          ? rightFlanking && (!leftFlanking || after === "punct")
          : rightFlanking;

      if (!canOpen && !canClose) {
        pending += char.repeat(count);
        index = runEnd;
        continue;
      }

      flush();

      const delim: DelimToken = {
        kind: "delim",
        char,
        count,
        original: count,
        canOpen,
        canClose,
        prev: null,
        next: null,
      };

      tokens.push(delim);
      delims.push(delim);
      index = runEnd;
      continue;
    }

    pending += char;
    index += 1;
  }

  flush();

  return { tokens, delims };
}

/* -------------------------------------------------------- emphasis matching */

/** Collect the nodes in `[from, to)`, merging adjacent literals. */
function collect(from: Token | null, to: Token | null): InlineNode[] {
  const nodes: InlineNode[] = [];

  const pushText = (value: string) => {
    if (!value) return;

    const last = nodes[nodes.length - 1];

    if (last && last.type === "text") last.value += value;
    else nodes.push({ type: "text", value });
  };

  for (let token = from; token && token !== to; token = token.next) {
    if (token.kind === "text") pushText(token.value);
    else if (token.kind === "node") nodes.push(token.node);
    // An unmatched delimiter is literal text — this is what renders the
    // leftover `*` in `*not emphasis`.
    else if (token.count > 0) pushText(token.char.repeat(token.count));
  }

  return nodes;
}

/**
 * Pair openers with closers, innermost first — the CommonMark delimiter-stack
 * pass, minus the `openers_bottom` optimisation that only matters for very long
 * inputs.
 */
function processEmphasis(tokens: TokenList, delims: DelimToken[]): void {
  for (let closerIndex = 0; closerIndex < delims.length; closerIndex += 1) {
    const closer = delims[closerIndex];

    if (closer.count === 0 || !closer.canClose) continue;

    let openerIndex = -1;

    for (let i = closerIndex - 1; i >= 0; i -= 1) {
      const candidate = delims[i];

      if (
        candidate.count === 0 ||
        !candidate.canOpen ||
        candidate.char !== closer.char
      ) {
        continue;
      }

      if (closer.char === "~") {
        if (candidate.count < 2 || closer.count < 2) continue;
      } else {
        // "Rule of three": a run that can both open and close only matches when
        // the combined lengths are not a multiple of three. Keeps `*a**b*`-style
        // input from pairing the wrong asterisks.
        const oddMatch =
          (closer.canOpen || candidate.canClose) &&
          closer.original % 3 !== 0 &&
          (candidate.original + closer.original) % 3 === 0;

        if (oddMatch) continue;
      }

      openerIndex = i;
      break;
    }

    if (openerIndex === -1) continue;

    const opener = delims[openerIndex];
    const used =
      closer.char === "~" ? 2 : opener.count >= 2 && closer.count >= 2 ? 2 : 1;

    const node: InlineNode =
      closer.char === "~"
        ? { type: "strike", children: collect(opener.next, closer) }
        : used === 2
          ? { type: "strong", children: collect(opener.next, closer) }
          : { type: "emphasis", children: collect(opener.next, closer) };

    opener.count -= used;
    closer.count -= used;

    // Splice the wrapped span out, leaving a single resolved node behind.
    const wrapper: NodeToken = {
      kind: "node",
      node,
      prev: opener,
      next: closer,
    };

    opener.next = wrapper;
    closer.prev = wrapper;

    // Delimiters inside the new node were already folded into its children.
    for (let i = openerIndex + 1; i < closerIndex; i += 1) {
      delims[i].count = 0;
    }

    if (opener.count === 0) tokens.remove(opener);

    if (closer.count === 0) {
      tokens.remove(closer);
    } else {
      // Chars left on this closer — try it against an earlier opener.
      closerIndex -= 1;
    }
  }
}

/* ------------------------------------------------------------------- public */

/** Parse inline markdown into a node tree. */
export function parseInline(text: string): InlineNode[] {
  if (!text) return [];

  const { tokens, delims } = tokenize(text);
  processEmphasis(tokens, delims);

  return collect(tokens.head.next, null);
}
