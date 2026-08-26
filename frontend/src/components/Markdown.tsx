/**
 * A small, dependency-free markdown renderer.
 *
 * Claude returns markdown-flavoured prose — headings, bold labels, bullet and
 * numbered lists, the occasional table or code span. Rather than pulling in a
 * full markdown library we parse the subset the model actually produces and
 * emit React elements, so nothing is ever injected as raw HTML (no
 * dangerouslySetInnerHTML anywhere in this file).
 *
 * Parsing lives in ./markdown: `blocks.ts` splits the document, `inline.ts`
 * tokenizes spans. This module is purely the React rendering layer.
 *
 * Supported: ATX headings, paragraphs, unordered/ordered lists (nested),
 * fenced code blocks, blockquotes, horizontal rules, GFM tables, and inline
 * bold / italic / bold-italic / strikethrough / code / links.
 *
 * Underscores in filenames, document names, IDs, and snake_case words are
 * preserved — see the flanking rules in ./markdown/inline.ts.
 */
import { Fragment, type ReactNode } from "react";
import { parseBlocks, type Alignment, type Block } from "./markdown/blocks";
import { parseInline, type InlineNode } from "./markdown/inline";

/* ------------------------------------------------------------------ inline */

function renderInlineNodes(
  nodes: InlineNode[],
  keyPrefix: string,
): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;

    switch (node.type) {
      case "text":
        return <Fragment key={key}>{node.value}</Fragment>;

      case "code":
        return (
          <code
            key={key}
            className="rounded-md border border-edge bg-base-750/80 px-1.5 py-0.5 font-mono text-[0.85em] text-aqua-300"
          >
            {node.value}
          </code>
        );

      case "strong":
        return (
          <strong key={key} className="font-semibold text-fg">
            {renderInlineNodes(node.children, key)}
          </strong>
        );

      case "emphasis":
        return (
          <em key={key} className="text-fg italic">
            {renderInlineNodes(node.children, key)}
          </em>
        );

      case "strike":
        return (
          <del key={key} className="text-fg-dim line-through">
            {renderInlineNodes(node.children, key)}
          </del>
        );

      case "link":
        return (
          <a
            key={key}
            href={node.href}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-brand-400 underline decoration-brand-400/40 underline-offset-2 transition-colors hover:text-brand-300 hover:decoration-brand-300"
          >
            {renderInlineNodes(node.children, key)}
          </a>
        );
    }
  });
}

/** Parse and render an inline string. */
function renderInline(text: string, keyPrefix = "i"): ReactNode[] {
  return renderInlineNodes(parseInline(text), keyPrefix);
}

/* --------------------------------------------------------------- rendering */

const HEADING_CLASS: Record<number, string> = {
  1: "mt-7 mb-3 text-xl font-semibold tracking-tight text-fg first:mt-0 sm:text-2xl",
  2: "mt-7 mb-3 text-lg font-semibold tracking-tight text-fg first:mt-0 sm:text-xl",
  3: "mt-6 mb-2 text-base font-semibold tracking-tight text-fg first:mt-0",
  4: "mt-5 mb-2 text-sm font-semibold tracking-tight text-fg-muted uppercase first:mt-0",
};

const ALIGN_CLASS: Record<Alignment, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

function renderBlocks(blocks: Block[], keyPrefix: string): ReactNode[] {
  return blocks.map((block, index) => {
    const key = `${keyPrefix}-${index}`;

    switch (block.kind) {
      case "heading": {
        const Tag = (block.level <= 4 ? `h${block.level}` : "h5") as "h1";
        const className = HEADING_CLASS[Math.min(block.level, 4)];

        // h2 gets a hairline underneath to separate major sections.
        return (
          <Tag key={key} className={className}>
            {renderInline(block.text, key)}
            {block.level === 2 && (
              <span className="rule-gradient mt-2 block h-px w-full opacity-70" />
            )}
          </Tag>
        );
      }

      case "paragraph":
        return (
          <p key={key} className="my-3 leading-relaxed text-fg-muted first:mt-0">
            {renderInline(block.text, key)}
          </p>
        );

      case "list": {
        const Tag = block.ordered ? "ol" : "ul";

        return (
          <Tag
            key={key}
            start={block.ordered && block.start !== 1 ? block.start : undefined}
            className={[
              "my-3 space-y-2 pl-5 text-fg-muted",
              block.ordered
                ? "list-decimal marker:font-medium marker:text-brand-400"
                : "list-disc marker:text-brand-500",
            ].join(" ")}
          >
            {block.items.map((item, itemIndex) => (
              <li key={`${key}-li-${itemIndex}`} className="pl-1 leading-relaxed">
                {/* Recurse: an item may hold paragraphs and nested lists. */}
                <div className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&>p]:my-1">
                  {renderBlocks(
                    parseBlocks(item.content),
                    `${key}-li-${itemIndex}`,
                  )}
                </div>
              </li>
            ))}
          </Tag>
        );
      }

      case "code":
        return (
          <div
            key={key}
            className="my-4 overflow-hidden rounded-xl border border-edge bg-base-950/70"
          >
            {block.language && (
              <div className="border-b border-edge bg-base-900/60 px-3 py-1.5 font-mono text-[11px] tracking-wide text-fg-dim uppercase">
                {block.language}
              </div>
            )}
            <pre className="overflow-x-auto p-3.5 text-[13px] leading-relaxed">
              <code className="font-mono text-aqua-300">{block.code}</code>
            </pre>
          </div>
        );

      case "quote":
        return (
          <blockquote
            key={key}
            className="my-4 rounded-r-lg border-l-2 border-brand-500/70 bg-brand-500/[0.06] py-1 pr-3 pl-4 text-fg-muted italic"
          >
            {renderBlocks(parseBlocks(block.content), key)}
          </blockquote>
        );

      case "rule":
        return (
          <hr key={key} className="my-6 h-px border-0 bg-edge" />
        );

      case "table":
        return (
          <div
            key={key}
            className="my-4 overflow-x-auto rounded-xl border border-edge"
          >
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-base-800/80">
                  {block.header.map((cell, cellIndex) => (
                    <th
                      key={`${key}-th-${cellIndex}`}
                      scope="col"
                      className={[
                        "border-b border-edge px-3.5 py-2.5 font-semibold whitespace-nowrap text-fg",
                        ALIGN_CLASS[block.align[cellIndex] ?? "left"],
                      ].join(" ")}
                    >
                      {renderInline(cell, `${key}-th-${cellIndex}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr
                    key={`${key}-tr-${rowIndex}`}
                    className="border-b border-edge/60 last:border-0 hover:bg-base-800/40"
                  >
                    {row.map((cell, cellIndex) => (
                      <td
                        key={`${key}-td-${rowIndex}-${cellIndex}`}
                        className={[
                          "px-3.5 py-2.5 align-top text-fg-muted",
                          ALIGN_CLASS[block.align[cellIndex] ?? "left"],
                        ].join(" ")}
                      >
                        {renderInline(cell, `${key}-td-${rowIndex}-${cellIndex}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  });
}

interface MarkdownProps {
  content: string;
  className?: string;
}

export default function Markdown({ content, className = "" }: MarkdownProps) {
  const blocks = parseBlocks(content ?? "");

  return (
    <div className={`text-[15px] ${className}`}>
      {renderBlocks(blocks, "b")}
    </div>
  );
}
