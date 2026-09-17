// The deterministic half of /clean's comment rules.
//
// Four of the rules in `src/commands/clean.md` are not judgement at all. A license header, a
// linter directive or doc annotation, a JSX section header, and the sole comment holding an
// intentionally empty block open each have one right answer every time, so
// `docs/adrs/0011-deterministic-comment-keeps-run-before-the-classifier.md` puts them in code
// ahead of the classifier — and, just as importantly, takes them out of the eval corpus.
// Scoring a question that cannot be got wrong would inflate agreement with exactly the cases
// the runtime path never asks about.
//
// This is a library and nothing calls it at runtime yet: ADR 0010 holds the runtime surface
// back to the campaign's last ticket. The pre-filter drops comments from the *question set*; it
// never trims the diff a judgement is made against, which is why there is no comment-scoping
// verb here.
//
// Zero dependencies, like the rest of the toolkit — it runs straight from a plugin clone.

/**
 * A mandatory keep, as one rule. `source` cites the line of `src/commands/clean.md` the rule
 * comes from, and those citations are what `clean-prefilter.test.mjs` holds against the
 * `preFilter.keptWithoutBeingJudged` block in `src/toolkit/judge/clean-comment.json`.
 * @typedef {object} PreFilterRule
 * @property {string} id
 * @property {string} summary
 * @property {string} source
 */

/**
 * The four mandatory keeps, in the order they are tested. ADR 0011 states them as four bullets;
 * `clean-comment.json` merges the first two into one entry because both sit on clean.md:65.
 * @type {PreFilterRule[]}
 */
export const RULES = [
  {
    id: 'license-header',
    summary: 'a license or copyright header at the top of a file',
    source: 'src/commands/clean.md:65',
  },
  {
    id: 'linter-directive',
    summary: 'a linter directive (biome-ignore, eslint-disable) or a doc/JSDoc annotation tag',
    source: 'src/commands/clean.md:65',
  },
  {
    id: 'jsx-section-header',
    summary: 'a JSX section header labelling a structural region of markup',
    source: 'src/commands/clean.md:66',
  },
  {
    id: 'empty-block-sole-comment',
    summary: 'the sole comment inside an intentionally empty block',
    source: 'src/commands/clean.md:67',
  },
];

/** How far into a file a comment can start and still read as its license header. */
const LICENSE_HEADER_MAX_LINE = 5;

/** A JSX section header is a label, not a sentence. Anything longer is prose and gets judged. */
const JSX_HEADER_MAX_WORDS = 5;

const LICENSE = /copyright|spdx-license-identifier|licensed under|all rights reserved|©/i;

/**
 * The directives that suppress a tool. Anchored at the start of the comment body: a sentence
 * that merely mentions `eslint-disable` is prose about a directive, not a directive.
 */
const DIRECTIVE =
  /^(biome-ignore|eslint-disable|eslint-enable|eslint-env|globals\s|oxlint-disable|oxlint-enable|prettier-ignore|istanbul ignore|c8 ignore|v8 ignore|node:coverage|@ts-ignore|@ts-expect-error|@ts-nocheck|jscs:|jshint |tslint:|noinspection |deno-lint-ignore|@flow)/i;

/** A JSDoc annotation tag — `@param`, `@returns`, `@type`, and the rest. */
const JSDOC_TAG = /(^|\s)@[a-z][a-zA-Z-]*(\s|$|\{)/;

/**
 * One comment found in a source file.
 * @typedef {object} CommentSpan
 * @property {string} text The comment exactly as written, delimiters included.
 * @property {string} body The comment's inner text, delimiters and leading `*` stripped.
 * @property {boolean} block `true` for a block comment, `false` for a line comment.
 * @property {number} startLine 1-based.
 * @property {number} endLine 1-based.
 * @property {number} startIndex Offset into the source.
 * @property {number} endIndex Offset just past the comment.
 * @property {boolean} jsxWrapped The comment is a `{\/* … *\/}` JSX expression container.
 */

/**
 * Every comment in a source file, with the position each was found at.
 *
 * A hand-rolled scanner rather than a parser: the toolkit takes no dependencies, and the rules
 * above need position and delimiters rather than a syntax tree. It tracks strings, template
 * literals and regex literals so a `//` inside one of them is not read as a comment.
 * @param {string} source
 * @returns {CommentSpan[]}
 */
export function scanComments(source) {
  /** @type {CommentSpan[]} */
  const found = [];
  let i = 0;
  let line = 1;
  // The last character that was not whitespace or a comment. A `/` is a regex literal rather
  // than a division when what precedes it cannot end an expression.
  let prevSignificant = '';

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === '\n') {
      line += 1;
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      const closed = skipString(source, i, ch);
      line += countNewlines(source.slice(i, closed));
      i = closed;
      prevSignificant = ch;
      continue;
    }

    if (ch === '/' && next === '/') {
      const stop = source.indexOf('\n', i);
      const end = stop === -1 ? source.length : stop;
      const text = source.slice(i, end);
      found.push(span(source, text, false, line, line, i, end));
      i = end;
      continue;
    }

    if (ch === '/' && next === '*') {
      const close = source.indexOf('*/', i + 2);
      const end = close === -1 ? source.length : close + 2;
      const text = source.slice(i, end);
      const endLine = line + countNewlines(text);
      found.push(span(source, text, true, line, endLine, i, end));
      line = endLine;
      i = end;
      continue;
    }

    if (ch === '/' && canStartRegex(prevSignificant)) {
      const closed = skipRegex(source, i);
      line += countNewlines(source.slice(i, closed));
      i = closed;
      prevSignificant = '/';
      continue;
    }

    if (!/\s/.test(ch)) prevSignificant = ch;
    i += 1;
  }

  return found;
}

/**
 * @param {string} source
 * @param {string} text
 * @param {boolean} block
 * @param {number} startLine
 * @param {number} endLine
 * @param {number} startIndex
 * @param {number} endIndex
 * @returns {CommentSpan}
 */
function span(source, text, block, startLine, endLine, startIndex, endIndex) {
  return {
    text,
    body: commentBody(text, block),
    block,
    startLine,
    endLine,
    startIndex,
    endIndex,
    jsxWrapped: block && isJsxWrapped(source, startIndex, endIndex),
  };
}

/**
 * A comment's inner text: delimiters gone, and the leading `*` of each JSDoc line with it.
 * @param {string} text
 * @param {boolean} block
 * @returns {string}
 */
function commentBody(text, block) {
  if (!block) return text.replace(/^\/\/+/, '').trim();
  return text
    .replace(/^\/\*+/, '')
    .replace(/\*+\/$/, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\*+\s?/, '').trim())
    .join('\n')
    .trim();
}

/**
 * Whether a block comment is wrapped as `{\/* … *\/}`, which in JSX is the only way to write a
 * comment inside markup.
 * @param {string} source
 * @param {number} startIndex
 * @param {number} endIndex
 * @returns {boolean}
 */
function isJsxWrapped(source, startIndex, endIndex) {
  const before = source.slice(0, startIndex).replace(/\s+$/, '');
  const after = source.slice(endIndex).replace(/^\s+/, '');
  return before.endsWith('{') && after.startsWith('}');
}

/**
 * @param {string} source
 * @param {number} start Index of the opening quote.
 * @param {string} quote
 * @returns {number} Index just past the closing quote.
 */
function skipString(source, start, quote) {
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === quote) return i + 1;
    // A template literal's `${…}` can hold anything, including a quote of another kind, so the
    // substitution is skipped whole rather than scanned as string content.
    if (quote === '`' && ch === '$' && source[i + 1] === '{') {
      i = skipBraces(source, i + 1);
      continue;
    }
    i += 1;
  }
  return source.length;
}

/**
 * @param {string} source
 * @param {number} start Index of the opening brace.
 * @returns {number} Index just past the matching brace.
 */
function skipBraces(source, start) {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return source.length;
}

/**
 * @param {string} source
 * @param {number} start Index of the opening slash.
 * @returns {number} Index just past the closing slash.
 */
function skipRegex(source, start) {
  let i = start + 1;
  let inClass = false;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '\n') return i;
    if (ch === '[') inClass = true;
    else if (ch === ']') inClass = false;
    else if (ch === '/' && !inClass) return i + 1;
    i += 1;
  }
  return source.length;
}

/**
 * Whether a `/` at this point opens a regex literal rather than dividing. Approximate by
 * design: what precedes a division is always something that can end an expression.
 * @param {string} prev
 * @returns {boolean}
 */
function canStartRegex(prev) {
  if (prev === '') return true;
  return !/[\w$)\]]/.test(prev);
}

/** @param {string} s @returns {number} */
function countNewlines(s) {
  let n = 0;
  for (const ch of s) if (ch === '\n') n += 1;
  return n;
}

/**
 * Which mandatory keep covers this comment, or `null` when none does and the comment is a real
 * question for the classifier.
 * @param {CommentSpan} comment
 * @param {string[]} sourceLines The file's lines, for the structural rules.
 * @returns {string | null} A rule id from {@link RULES}.
 */
export function matchRule(comment, sourceLines) {
  if (isLicenseHeader(comment)) return 'license-header';
  if (isLinterDirective(comment)) return 'linter-directive';
  if (isJsxSectionHeader(comment)) return 'jsx-section-header';
  if (isEmptyBlockSoleComment(comment, sourceLines)) return 'empty-block-sole-comment';
  return null;
}

/** @param {CommentSpan} comment @returns {boolean} */
function isLicenseHeader(comment) {
  return comment.startLine <= LICENSE_HEADER_MAX_LINE && LICENSE.test(comment.body);
}

/** @param {CommentSpan} comment @returns {boolean} */
function isLinterDirective(comment) {
  if (DIRECTIVE.test(comment.body)) return true;
  // A doc block earns the keep from carrying an annotation tag, not from being a `/**` block:
  // a `/** One sentence. */` with no tag is ordinary prose and stays judgeable.
  return comment.block && comment.text.startsWith('/**') && JSDOC_TAG.test(comment.body);
}

/** @param {CommentSpan} comment @returns {boolean} */
function isJsxSectionHeader(comment) {
  if (!comment.jsxWrapped) return false;
  const words = comment.body.split(/\s+/).filter((w) => w.length > 0);
  // A label, not prose: short, and not a sentence.
  return words.length > 0 && words.length <= JSX_HEADER_MAX_WORDS && !/[.!?]$/.test(comment.body);
}

/**
 * The sole comment inside an intentionally empty block. Load-bearing rather than decorative:
 * Biome's `noEmptyBlockStatements` fails on an empty block with no comment, so deleting this
 * one breaks the build.
 * @param {CommentSpan} comment
 * @param {string[]} sourceLines
 * @returns {boolean}
 */
function isEmptyBlockSoleComment(comment, sourceLines) {
  const before = previousCode(sourceLines, comment.startLine);
  const after = nextCode(sourceLines, comment.endLine);
  if (before === null || after === null) return false;
  // An opening brace immediately before and a closing brace immediately after, with nothing
  // between them but this comment.
  return before.trimEnd().endsWith('{') && after.trimStart().startsWith('}');
}

/**
 * The nearest line of code above `line` that is neither blank nor a comment.
 * @param {string[]} sourceLines
 * @param {number} line 1-based.
 * @returns {string | null}
 */
function previousCode(sourceLines, line) {
  for (let i = line - 2; i >= 0; i -= 1) {
    const text = sourceLines[i];
    if (text === undefined) return null;
    if (text.trim().length === 0) continue;
    // Another comment above means this one is not the sole comment in the block.
    if (/^\s*(\/\/|\/\*|\*)/.test(text)) return null;
    return text;
  }
  return null;
}

/**
 * The nearest line of code below `line` that is neither blank nor a comment.
 * @param {string[]} sourceLines
 * @param {number} line 1-based.
 * @returns {string | null}
 */
function nextCode(sourceLines, line) {
  for (let i = line; i < sourceLines.length; i += 1) {
    const text = sourceLines[i];
    if (text === undefined) return null;
    if (text.trim().length === 0) continue;
    if (/^\s*(\/\/|\/\*|\*)/.test(text)) return null;
    return text;
  }
  return null;
}

/**
 * Whether this comment is kept without being judged.
 * @param {CommentSpan} comment
 * @param {string[]} sourceLines
 * @returns {boolean}
 */
export function isMandatoryKeep(comment, sourceLines) {
  return matchRule(comment, sourceLines) !== null;
}

/**
 * A comment the pre-filter kept, with the rule that kept it.
 * @typedef {object} KeptComment
 * @property {CommentSpan} comment
 * @property {string} rule
 */

/**
 * Split a file's comments into the ones the pre-filter keeps outright and the ones that are
 * genuine questions.
 *
 * `judgeable` is what a classifier would be asked about at runtime, and — by ADR 0011 — it is
 * also the only population the eval corpus may draw a label from.
 * @param {string} source
 * @returns {{kept: KeptComment[], judgeable: CommentSpan[]}}
 */
export function partitionComments(source) {
  const sourceLines = source.split('\n');
  /** @type {KeptComment[]} */
  const kept = [];
  /** @type {CommentSpan[]} */
  const judgeable = [];
  for (const comment of scanComments(source)) {
    const rule = matchRule(comment, sourceLines);
    if (rule === null) judgeable.push(comment);
    else kept.push({ comment, rule });
  }
  return { kept, judgeable };
}

/**
 * The same decision for a comment recovered from a diff, where the whole file is not in hand.
 *
 * The corpus extractor works from diff hunks, so it has the comment and the lines around it
 * rather than the file it came from. `contextLines` is that window and `line` is the comment's
 * 1-based position inside it.
 * @param {string} text The comment as written.
 * @param {string[]} contextLines
 * @param {number} line 1-based position of the comment within `contextLines`.
 * @returns {string | null} The rule that keeps it, or `null` when it is judgeable.
 */
export function ruleForRecoveredComment(text, contextLines, line) {
  const block = text.trimStart().startsWith('/*');
  /** @type {CommentSpan} */
  const comment = {
    text,
    body: commentBody(text.trim(), block),
    block,
    startLine: line,
    endLine: line + countNewlines(text),
    startIndex: 0,
    endIndex: text.length,
    jsxWrapped: /^\{\s*\/\*/.test(text.trim()) && /\*\/\s*\}$/.test(text.trim()),
  };
  return matchRule(comment, contextLines);
}
