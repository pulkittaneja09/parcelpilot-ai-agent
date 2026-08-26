/**
 * Block-level markdown parsing.
 *
 * Handles the subset the model actually produces: ATX headings, paragraphs,
 * nested unordered/ordered lists, fenced code blocks, blockquotes, horizontal
 * rules, and GFM tables. Inline content is left as raw strings for
 * `parseInline` to handle.
 *
 * Pure — no React — so it can be unit-tested directly.
 */

export type Alignment = "left" | "center" | "right";

export interface ListItem {
  content: string;
}

export type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; start: number; items: ListItem[] }
  | { kind: "code"; language: string; code: string }
  | { kind: "quote"; content: string }
  | { kind: "rule" }
  | { kind: "table"; header: string[]; rows: string[][]; align: Alignment[] };

const RE_FENCE = /^\s{0,3}(?:```|~~~)\s*([\w+-]*)\s*$/;
const RE_HEADING = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const RE_RULE = /^\s{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const RE_QUOTE = /^\s{0,3}>\s?(.*)$/;
const RE_UL = /^(\s*)[-*+][ \t]+(.*)$/;
const RE_OL = /^(\s*)(\d{1,9})[.)][ \t]+(.*)$/;
const RE_TABLE_ROW = /^\s*\|(.+)\|\s*$/;
const RE_TABLE_DIVIDER = /^\s*\|?[\s:|-]+\|[\s:|-]*$/;

function splitTableRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split("|").map((cell) => cell.trim());
}

/** True if a block-level construct starts at this line (ends a paragraph). */
function startsNewBlock(line: string): boolean {
  return (
    !line.trim() ||
    RE_FENCE.test(line) ||
    RE_HEADING.test(line) ||
    RE_RULE.test(line) ||
    RE_QUOTE.test(line) ||
    RE_UL.test(line) ||
    RE_OL.test(line) ||
    RE_TABLE_ROW.test(line)
  );
}

/** Remove `width` leading spaces from a line, tolerating shorter indents. */
function dedent(line: string, width: number): string {
  let removed = 0;
  let index = 0;

  while (index < line.length && removed < width && line[index] === " ") {
    index += 1;
    removed += 1;
  }

  return line.slice(index);
}

export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let cursor = 0;

  while (cursor < lines.length) {
    const line = lines[cursor];

    // Blank
    if (!line.trim()) {
      cursor += 1;
      continue;
    }

    // Fenced code block
    const fence = line.match(RE_FENCE);
    if (fence) {
      const language = fence[1] ?? "";
      const body: string[] = [];
      cursor += 1;

      while (cursor < lines.length && !RE_FENCE.test(lines[cursor])) {
        body.push(lines[cursor]);
        cursor += 1;
      }
      cursor += 1; // consume the closing fence

      blocks.push({ kind: "code", language, code: body.join("\n") });
      continue;
    }

    // Heading
    const heading = line.match(RE_HEADING);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1].length,
        text: heading[2],
      });
      cursor += 1;
      continue;
    }

    // Horizontal rule
    if (RE_RULE.test(line)) {
      blocks.push({ kind: "rule" });
      cursor += 1;
      continue;
    }

    // Table — a row followed by a |---|---| divider
    if (
      RE_TABLE_ROW.test(line) &&
      cursor + 1 < lines.length &&
      RE_TABLE_DIVIDER.test(lines[cursor + 1]) &&
      lines[cursor + 1].includes("-")
    ) {
      const header = splitTableRow(line);
      const align: Alignment[] = splitTableRow(lines[cursor + 1]).map((cell) => {
        const left = cell.startsWith(":");
        const right = cell.endsWith(":");
        if (left && right) return "center";
        if (right) return "right";
        return "left";
      });

      cursor += 2;
      const rows: string[][] = [];

      while (cursor < lines.length && RE_TABLE_ROW.test(lines[cursor])) {
        rows.push(splitTableRow(lines[cursor]));
        cursor += 1;
      }

      blocks.push({ kind: "table", header, rows, align });
      continue;
    }

    // Blockquote — collect consecutive `>` lines, then parse them recursively
    if (RE_QUOTE.test(line)) {
      const body: string[] = [];

      while (cursor < lines.length) {
        const quoted = lines[cursor].match(RE_QUOTE);
        if (!quoted) break;
        body.push(quoted[1]);
        cursor += 1;
      }

      blocks.push({ kind: "quote", content: body.join("\n") });
      continue;
    }

    // Lists — an item's own text plus any deeper-indented continuation lines
    // become that item's content, which is parsed recursively. That gives
    // nested lists and multi-paragraph items for free.
    const ulMatch = line.match(RE_UL);
    const olMatch = line.match(RE_OL);

    if (ulMatch || olMatch) {
      const ordered = !ulMatch;
      const baseIndent = (ulMatch ?? olMatch)![1].length;
      const start = olMatch ? Number.parseInt(olMatch[2], 10) : 1;
      const items: ListItem[] = [];
      let buffer: string[] = [];

      const flush = () => {
        if (buffer.length) {
          items.push({ content: buffer.join("\n").trimEnd() });
          buffer = [];
        }
      };

      while (cursor < lines.length) {
        const current = lines[cursor];

        if (!current.trim()) {
          // A blank line only continues the list if an indented line follows.
          const next = lines[cursor + 1];
          if (next && next.trim() && next.match(/^\s*/)![0].length > baseIndent) {
            buffer.push("");
            cursor += 1;
            continue;
          }
          break;
        }

        const indent = current.match(/^\s*/)![0].length;
        const itemUl = current.match(RE_UL);
        const itemOl = current.match(RE_OL);
        const isItem = Boolean(itemUl ?? itemOl);

        // A sibling marker at the same indent starts the next item.
        if (isItem && indent <= baseIndent) {
          const sameKind = ordered ? Boolean(itemOl) : Boolean(itemUl);
          if (!sameKind) break; // list type switched — let the outer loop handle it

          flush();
          buffer.push(ordered ? itemOl![3] : itemUl![2]);
          cursor += 1;
          continue;
        }

        // Deeper indent → continuation (nested list or wrapped text).
        if (indent > baseIndent) {
          buffer.push(dedent(current, baseIndent + 2));
          cursor += 1;
          continue;
        }

        break;
      }

      flush();
      blocks.push({ kind: "list", ordered, start, items });
      continue;
    }

    // Paragraph — run of lines until the next block-level construct
    const paragraph: string[] = [line.trim()];
    cursor += 1;

    while (cursor < lines.length && !startsNewBlock(lines[cursor])) {
      paragraph.push(lines[cursor].trim());
      cursor += 1;
    }

    blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}
