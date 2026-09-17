// The eval corpus for /clean's comment keep/drop, recovered from git rather than authored.
//
// `docs/adrs/0008-no-question-set-acts-in-this-campaign.md` made this the campaign's
// calibration vehicle on the strength of labels that already exist: this repository runs
// /clean as its own commit — "chore: clean the refactor's comments" and its siblings — and each
// of those commits is a recorded verdict on every comment in the files it touched. A comment it
// removed was a Delete, one it rewrote shorter was a Tighten, and one it left alone was a Keep.
// Thousands of labels at no authoring cost.
//
// **The pre-filter is applied to the corpus too, and that is the half that protects the
// metric.** A comment `clean-prefilter.mjs` would have kept never becomes a labelled row here.
// ADR 0011 is explicit about why: recovering labels without the pre-filter would score exactly
// the questions the pre-filter removes at runtime, and the agreement number would be inflated
// by cases the classifier is never asked about. Over-excluding is the safe direction and
// under-excluding is not, so a comment that is arguably a mandatory keep is dropped rather than
// scored.
//
// The extractor writes nothing into the repository. Its output is corpus data for the harness
// in ticket 05, and the runtime surface that might one day use the pre-filter is ticket 07's.

import { partitionComments, ruleForRecoveredComment, scanComments } from './clean-prefilter.mjs';
import { run } from './proc.mjs';

/**
 * Commits that are a /clean pass. This repository's convention is a dedicated commit whose
 * subject says it cleaned comments, which is what makes the verdict readable: a commit that
 * both implements and cleans cannot be told apart from ordinary editing.
 */
const CLEAN_SUBJECT = /\bclean(ed|ing)?\b[^\n]*\bcomments?\b|\bcomments?\b[^\n]*\bclean(ed|ing)?\b/i;

/** The files /clean judges comments in. Markdown prose is out of its scope by its own rules. */
const CODE = /\.(mjs|cjs|js|jsx|mts|cts|ts|tsx)$/;

/** Lines of the file kept either side of a comment as the code it sits beside. */
const CONTEXT_LINES = 6;

/** How close a rewritten comment must stay to the original's position to read as a rewrite. */
const REWRITE_DRIFT_LINES = 12;

/** Share of the original's words a shorter comment must keep to count as a tightening. */
const REWRITE_OVERLAP = 0.4;

/**
 * One recovered label.
 * @typedef {object} CorpusEntry
 * @property {string} commit The /clean commit that recorded the verdict.
 * @property {string} subject
 * @property {string} file
 * @property {number} line 1-based, in the file as /clean found it.
 * @property {string} comment The comment as /clean found it.
 * @property {'delete' | 'tighten' | 'keep'} label
 * @property {string} [rewrittenTo] For a tighten, what it became.
 * @property {string} codeContext The code the comment sits beside.
 * @property {string} surroundingDiff The branch work /clean judged this comment against.
 */

/**
 * What a run recovered.
 * @typedef {object} Corpus
 * @property {CorpusEntry[]} entries
 * @property {number} size
 * @property {Record<string, number>} counts Label to how many entries carry it.
 * @property {{label: string, share: number}} baseline The majority class.
 * @property {{total: number, byRule: Record<string, number>}} preFiltered
 * @property {number} commits How many /clean commits contributed.
 */

/**
 * @param {string} cwd
 * @param {string[]} args
 * @returns {string}
 */
function git(cwd, args) {
  const r = run('git', args, { cwd, raw: true });
  return r.ok ? r.stdout : '';
}

/**
 * The /clean commits in this repository's history, newest first.
 * @param {string} cwd
 * @param {{limit?: number, ref?: string}} [opts]
 * @returns {{sha: string, subject: string}[]}
 */
export function findCleanCommits(cwd, opts = {}) {
  const ref = opts.ref ?? '--all';
  const out = git(cwd, ['log', ref, '--no-merges', '--format=%H%x00%s']);
  /** @type {{sha: string, subject: string}[]} */
  const found = [];
  const seen = new Set();
  for (const row of out.split('\n')) {
    if (row.trim().length === 0) continue;
    const [sha, subject] = row.split('\0');
    if (!sha || subject === undefined) continue;
    if (!isCleanSubject(subject)) continue;
    // `--all` walks every ref, so the same commit arrives once per branch that holds it.
    if (seen.has(sha)) continue;
    seen.add(sha);
    found.push({ sha, subject });
    if (opts.limit !== undefined && found.length >= opts.limit) break;
  }
  return found;
}

/** @param {string} subject @returns {boolean} */
export function isCleanSubject(subject) {
  return CLEAN_SUBJECT.test(subject);
}

/**
 * The code files a commit changed.
 * @param {string} cwd
 * @param {string} sha
 * @returns {string[]}
 */
function changedCodeFiles(cwd, sha) {
  const out = git(cwd, ['show', '--format=', '--name-only', '--diff-filter=M', sha]);
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && CODE.test(l));
}

/**
 * The diff /clean judged a file's comments against: the commit immediately before the clean
 * pass, which is the branch work it was run over. Where that commit did not touch the file, the
 * clean pass's own diff for it is the closest honest answer.
 * @param {string} cwd
 * @param {string} sha
 * @param {string} file
 * @returns {string}
 */
function surroundingDiff(cwd, sha, file) {
  const prior = git(cwd, ['show', '--format=', `-U${CONTEXT_LINES}`, `${sha}^`, '--', file]);
  if (prior.trim().length > 0) return prior;
  return git(cwd, ['show', '--format=', `-U${CONTEXT_LINES}`, sha, '--', file]);
}

/** @param {string} text @returns {string[]} */
function words(text) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
}

/**
 * Whether `after` reads as a tightened form of `before` rather than a different comment.
 * @param {string} before
 * @param {string} after
 * @returns {boolean}
 */
function isTightening(before, after) {
  if (after.length >= before.length) return false;
  const original = words(before);
  if (original.length === 0) return false;
  const surviving = new Set(words(after));
  const kept = original.filter((w) => surviving.has(w)).length;
  return kept / original.length >= REWRITE_OVERLAP;
}

/**
 * Recover every label one /clean commit recorded.
 *
 * Works from the file as /clean found it (the commit's parent) rather than from diff hunks,
 * because a Keep leaves no hunk at all — the comments a pass deliberately left alone are the
 * majority class, and a hunk-only reading would miss all of them.
 * @param {string} cwd
 * @param {string} sha
 * @param {string} subject
 * @returns {{entries: CorpusEntry[], preFiltered: Record<string, number>}}
 */
export function extractCommit(cwd, sha, subject) {
  /** @type {CorpusEntry[]} */
  const entries = [];
  /** @type {Record<string, number>} */
  const preFiltered = {};

  for (const file of changedCodeFiles(cwd, sha)) {
    const before = git(cwd, ['show', `${sha}^:${file}`]);
    const after = git(cwd, ['show', `${sha}:${file}`]);
    if (before.trim().length === 0) continue;

    const { kept, judgeable } = partitionComments(before);
    // ADR 0011: these never become rows. Counted so the run can say how many it removed.
    for (const k of kept) preFiltered[k.rule] = (preFiltered[k.rule] ?? 0) + 1;

    const beforeLines = before.split('\n');
    const afterComments = scanComments(after);
    const survivingText = new Set(afterComments.map((c) => c.text.trim()));
    const diff = surroundingDiff(cwd, sha, file);

    for (const comment of judgeable) {
      const text = comment.text.trim();
      /** @type {'delete' | 'tighten' | 'keep'} */
      let label;
      /** @type {string | undefined} */
      let rewrittenTo;

      if (survivingText.has(text)) {
        label = 'keep';
      } else {
        const rewrite = afterComments.find(
          (c) =>
            Math.abs(c.startLine - comment.startLine) <= REWRITE_DRIFT_LINES &&
            !judgeable.some((j) => j.text.trim() === c.text.trim()) &&
            isTightening(comment.body, c.body),
        );
        if (rewrite) {
          label = 'tighten';
          rewrittenTo = rewrite.text.trim();
        } else {
          label = 'delete';
        }
      }

      /** @type {CorpusEntry} */
      const entry = {
        commit: sha,
        subject,
        file,
        line: comment.startLine,
        comment: comment.text,
        label,
        codeContext: contextAround(beforeLines, comment.startLine, comment.endLine),
        surroundingDiff: diff,
      };
      if (rewrittenTo !== undefined) entry.rewrittenTo = rewrittenTo;
      entries.push(entry);
    }
  }

  return { entries, preFiltered };
}

/**
 * @param {string[]} lines
 * @param {number} startLine 1-based.
 * @param {number} endLine 1-based.
 * @returns {string}
 */
function contextAround(lines, startLine, endLine) {
  const from = Math.max(0, startLine - 1 - CONTEXT_LINES);
  const to = Math.min(lines.length, endLine + CONTEXT_LINES);
  return lines.slice(from, to).join('\n');
}

/**
 * The share of the corpus held by its largest label.
 *
 * Reported before any agreement number, because most comments survive a /clean and a classifier
 * that always answered Keep would otherwise look strong.
 * `docs/adrs/0013-the-eval-bar-is-pre-registered.md` expresses Subject A's bar against it: the
 * classifier must beat this by 10 percentage points at confidence >= 0.9, and be above 0.90
 * absolute, or the subject is abandoned.
 * @param {Record<string, number>} counts
 * @param {number} size
 * @returns {{label: string, share: number}}
 */
export function majorityClassBaseline(counts, size) {
  if (size === 0) return { label: 'none', share: 0 };
  let label = 'none';
  let best = -1;
  for (const [name, n] of Object.entries(counts)) {
    if (n > best) {
      best = n;
      label = name;
    }
  }
  return { label, share: best / size };
}

/**
 * Recover the whole corpus from a repository's history.
 * @param {string} cwd
 * @param {{limit?: number, ref?: string}} [opts]
 * @returns {Corpus}
 */
export function buildCorpus(cwd, opts = {}) {
  const commits = findCleanCommits(cwd, opts);
  /** @type {CorpusEntry[]} */
  const entries = [];
  /** @type {Record<string, number>} */
  const byRule = {};

  for (const { sha, subject } of commits) {
    const got = extractCommit(cwd, sha, subject);
    entries.push(...got.entries);
    for (const [rule, n] of Object.entries(got.preFiltered)) byRule[rule] = (byRule[rule] ?? 0) + n;
  }

  /** @type {Record<string, number>} */
  const counts = {};
  for (const e of entries) counts[e.label] = (counts[e.label] ?? 0) + 1;
  const total = Object.values(byRule).reduce((a, b) => a + b, 0);

  return {
    entries,
    size: entries.length,
    counts,
    baseline: majorityClassBaseline(counts, entries.length),
    preFiltered: { total, byRule },
    commits: commits.length,
  };
}

/**
 * The corpus without its entries — what a run reports before any agreement number.
 * @param {Corpus} corpus
 * @returns {{size: number, commits: number, counts: Record<string, number>,
 *   baseline: {label: string, share: number}, preFiltered: {total: number, byRule: Record<string, number>}}}
 */
export function summarise(corpus) {
  return {
    size: corpus.size,
    commits: corpus.commits,
    counts: corpus.counts,
    baseline: corpus.baseline,
    preFiltered: corpus.preFiltered,
  };
}

/**
 * Whether a comment recovered from a diff would have been pre-filtered. Exposed so the harness
 * can re-check a row it did not build itself.
 * @param {string} text
 * @param {string[]} contextLines
 * @param {number} line
 * @returns {boolean}
 */
export function wouldPreFilter(text, contextLines, line) {
  return ruleForRecoveredComment(text, contextLines, line) !== null;
}
