/**
 * Unit tests for the markdown parser.
 *
 * Run with: npm run test:markdown
 *
 * The parser is pure TypeScript with no React or DOM dependency, so these tests
 * exercise the real source files rather than a copy. The bulk of the suite
 * covers the underscore bug: filenames like 01_Support_Policy_v3_CURRENT.pdf
 * must survive verbatim while genuine _emphasis_ keeps working.
 */
import { parseBlocks, type Block } from "../src/components/markdown/blocks";
import {
  parseInline,
  type InlineNode,
} from "../src/components/markdown/inline";

/* ------------------------------------------------------------- serializers */

/** Visible text only — what a reader would see with all formatting stripped. */
function toText(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
        case "code":
          return node.value;
        default:
          return toText(node.children);
      }
    })
    .join("");
}

/** Structure as tags, so emphasis boundaries are assertable. */
function toMarkup(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
          return node.value;
        case "code":
          return `<code>${node.value}</code>`;
        case "strong":
          return `<strong>${toMarkup(node.children)}</strong>`;
        case "emphasis":
          return `<em>${toMarkup(node.children)}</em>`;
        case "strike":
          return `<del>${toMarkup(node.children)}</del>`;
        case "link":
          return `<a href="${node.href}">${toMarkup(node.children)}</a>`;
      }
    })
    .join("");
}

function blockToString(block: Block): string {
  switch (block.kind) {
    case "heading":
      return `h${block.level}(${toMarkup(parseInline(block.text))})`;
    case "paragraph":
      return `p(${toMarkup(parseInline(block.text))})`;
    case "list":
      return `${block.ordered ? "ol" : "ul"}[${block.items
        .map((item) =>
          parseBlocks(item.content).map(blockToString).join(""),
        )
        .join("|")}]`;
    case "code":
      return `pre(${block.language}:${block.code})`;
    case "quote":
      return `quote(${parseBlocks(block.content).map(blockToString).join("")})`;
    case "rule":
      return "hr";
    case "table":
      return `table(head:${block.header
        .map((cell) => toMarkup(parseInline(cell)))
        .join(",")};rows:${block.rows
        .map((row) => row.map((cell) => toMarkup(parseInline(cell))).join(","))
        .join(";")};align:${block.align.join(",")})`;
  }
}

function docToString(source: string): string {
  return parseBlocks(source).map(blockToString).join("\n");
}

/* ---------------------------------------------------------------- harness */

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: string, expected: string): void {
  if (actual === expected) {
    passed += 1;
    return;
  }

  failures.push(
    `${name}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`,
  );
}

/** Inline source must round-trip to exactly the same visible text. */
function preservesLiterally(name: string, source: string): void {
  check(`${name} — text`, toText(parseInline(source)), source);
  check(`${name} — markup`, toMarkup(parseInline(source)), source);
}

function inlineMarkup(name: string, source: string, expected: string): void {
  check(name, toMarkup(parseInline(source)), expected);
}

function blocks(name: string, source: string, expected: string): void {
  check(name, docToString(source), expected);
}

/* ------------------------------------- the filenames from the bug report */

const FILENAMES = [
  "01_Support_Policy_v3_CURRENT.pdf",
  "02_Support_Policy_v2_DEPRECATED.pdf",
  "03_Cancellation_and_Service_Credit_SOP_v4.pdf",
  "04_Product_Operations_Guide_and_Known_Issues.pdf",
  "05_Northstar_Logistics_Enterprise_Agreement.pdf",
  "06_LumenWorks_Service_Agreement.pdf",
];

for (const filename of FILENAMES) {
  preservesLiterally(`bare ${filename}`, filename);
  preservesLiterally(
    `in prose ${filename}`,
    `Per ${filename}, the fee is waived for this account.`,
  );
  preservesLiterally(
    `two filenames ${filename}`,
    `See ${filename} and 01_Support_Policy_v3_CURRENT.pdf for details.`,
  );

  // The single most common real shape: a bolded filename.
  inlineMarkup(
    `bold ${filename}`,
    `Source: **${filename}**`,
    `Source: <strong>${filename}</strong>`,
  );

  // Inline code must not re-parse its contents either.
  inlineMarkup(
    `code ${filename}`,
    `Source: \`${filename}\``,
    `Source: <code>${filename}</code>`,
  );
}

preservesLiterally("ticket id", "TKT-502");
preservesLiterally("order id", "ORD-1001");
preservesLiterally("ids in prose", "Ticket TKT-502 relates to order ORD-1001.");
preservesLiterally("snake_case identifier", "cancellation_requested_at");
preservesLiterally("multiple snake_case", "account_id, order_id, ticket_id");
preservesLiterally("underscore run in word", "weird__double__word");
preservesLiterally("trailing underscore word", "value_");
preservesLiterally("leading underscore word", "_value");
preservesLiterally(
  "full sentence with everything",
  "Per 05_Northstar_Logistics_Enterprise_Agreement.pdf, ticket TKT-501 is P1 and the field is last_customer_message_at.",
);

/* ----------------------------------------------- emphasis still functions */

inlineMarkup("bold", "**bold**", "<strong>bold</strong>");
inlineMarkup("bold underscores", "__bold__", "<strong>bold</strong>");
inlineMarkup("italic star", "*italic*", "<em>italic</em>");
inlineMarkup("italic underscore", "_italic_", "<em>italic</em>");
inlineMarkup(
  "italic underscore multi-word",
  "_two words_",
  "<em>two words</em>",
);
// CommonMark nests these as em-outside/strong-inside; both render bold+italic.
inlineMarkup(
  "bold italic",
  "***both***",
  "<em><strong>both</strong></em>",
);
inlineMarkup(
  "bold italic underscores",
  "___both___",
  "<em><strong>both</strong></em>",
);
inlineMarkup("strikethrough", "~~gone~~", "<del>gone</del>");
inlineMarkup(
  "nested emphasis",
  "**bold _and italic_**",
  "<strong>bold <em>and italic</em></strong>",
);
inlineMarkup(
  "emphasis after punctuation",
  "(_italic_)",
  "(<em>italic</em>)",
);
inlineMarkup(
  "bold label then filename",
  "**Supporting Source:** 01_Support_Policy_v3_CURRENT.pdf",
  "<strong>Supporting Source:</strong> 01_Support_Policy_v3_CURRENT.pdf",
);
inlineMarkup(
  "escaped underscores",
  "\\_not italic\\_",
  "_not italic_",
);
inlineMarkup("unmatched star", "*not emphasis", "*not emphasis");
inlineMarkup("unmatched underscore", "_not emphasis", "_not emphasis");
inlineMarkup(
  "underscore emphasis around a filename",
  "_see 01_Support_Policy_v3_CURRENT.pdf_",
  "<em>see 01_Support_Policy_v3_CURRENT.pdf</em>",
);
inlineMarkup("intraword star emphasis", "a*b*c", "a<em>b</em>c");
inlineMarkup("code containing a backtick", "``a ` b``", "<code>a ` b</code>");
inlineMarkup("code span stops at first match", "`a ` b`", "<code>a </code> b`");
inlineMarkup("unclosed code span", "a ` b", "a ` b");

/* -------------------------------------------------------------------- links */

inlineMarkup(
  "link",
  "[docs](https://example.com/a_b_c)",
  '<a href="https://example.com/a_b_c">docs</a>',
);
inlineMarkup(
  "relative link",
  "[docs](/policies/01_Support_Policy_v3_CURRENT.pdf)",
  '<a href="/policies/01_Support_Policy_v3_CURRENT.pdf">docs</a>',
);
inlineMarkup(
  "unsafe scheme stays literal",
  "[click](javascript:alert(1))",
  "[click](javascript:alert(1))",
);
inlineMarkup("not a link", "[just brackets] and (parens)", "[just brackets] and (parens)");

/* ------------------------------------------------------------ block level */

blocks("heading", "## Direct Answer", "h2(Direct Answer)");
blocks(
  "heading with filename",
  "### Source: 01_Support_Policy_v3_CURRENT.pdf",
  "h3(Source: 01_Support_Policy_v3_CURRENT.pdf)",
);
blocks(
  "bullet list",
  "- First 01_Support_Policy_v3_CURRENT.pdf\n- Second **bold**",
  "ul[p(First 01_Support_Policy_v3_CURRENT.pdf)|p(Second <strong>bold</strong>)]",
);
blocks(
  "numbered list",
  "1. Direct Answer\n2. Reasoning for TKT-502",
  "ol[p(Direct Answer)|p(Reasoning for TKT-502)]",
);
blocks(
  "nested list",
  "- Outer\n  - Inner 04_Product_Operations_Guide_and_Known_Issues.pdf",
  "ul[p(Outer)ul[p(Inner 04_Product_Operations_Guide_and_Known_Issues.pdf)]]",
);
blocks(
  "table",
  [
    "| Document | Precedence |",
    "|---|---:|",
    "| 05_Northstar_Logistics_Enterprise_Agreement.pdf | 1 |",
    "| 01_Support_Policy_v3_CURRENT.pdf | 2 |",
  ].join("\n"),
  "table(head:Document,Precedence;rows:05_Northstar_Logistics_Enterprise_Agreement.pdf,1;01_Support_Policy_v3_CURRENT.pdf,2;align:left,right)",
);
blocks("horizontal rule", "---", "hr");
blocks("underscore rule", "___", "hr");
blocks(
  "fenced code",
  "```json\n{\"order_id\": \"ORD-1001\"}\n```",
  'pre(json:{"order_id": "ORD-1001"})',
);
blocks(
  "blockquote",
  "> Per 01_Support_Policy_v3_CURRENT.pdf the SLA is 15 minutes.",
  "quote(p(Per 01_Support_Policy_v3_CURRENT.pdf the SLA is 15 minutes.))",
);

/* --------------------------------- a realistic answer, end to end */

const ANSWER = [
  "## Direct Answer",
  "",
  "This is a **P1 Critical** incident for ticket TKT-501 with a 15-minute first",
  "response target.",
  "",
  "### Reasoning",
  "",
  "- All shipment creation is failing, which matches the P1 definition in",
  "  01_Support_Policy_v3_CURRENT.pdf.",
  "- Northstar Logistics has premium support per",
  "  05_Northstar_Logistics_Enterprise_Agreement.pdf.",
  "",
  "| Source | Precedence |",
  "|---|---|",
  "| 05_Northstar_Logistics_Enterprise_Agreement.pdf | 1 |",
  "| 04_Product_Operations_Guide_and_Known_Issues.pdf | 3 |",
  "",
  "1. Acknowledge within 15 minutes.",
  "2. Check the `shipment_created_at` field on ORD-1001.",
].join("\n");

const rendered = docToString(ANSWER);

for (const filename of [
  "01_Support_Policy_v3_CURRENT.pdf",
  "04_Product_Operations_Guide_and_Known_Issues.pdf",
  "05_Northstar_Logistics_Enterprise_Agreement.pdf",
]) {
  check(
    `realistic answer preserves ${filename}`,
    String(rendered.includes(filename)),
    "true",
  );
}

check(
  "realistic answer keeps bold",
  String(rendered.includes("<strong>P1 Critical</strong>")),
  "true",
);
check(
  "realistic answer keeps inline code",
  String(rendered.includes("<code>shipment_created_at</code>")),
  "true",
);
check(
  "realistic answer produces no stray emphasis",
  String(rendered.includes("<em>")),
  "false",
);

/* ------------------------------------------------------------------ report */

if (failures.length > 0) {
  console.error(`\n${failures.length} markdown test(s) FAILED:\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}\n`);
  console.error(`${passed} passed, ${failures.length} failed`);
  process.exit(1);
}

console.log(`✓ all ${passed} markdown assertions passed`);
