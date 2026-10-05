#!/usr/bin/env node
// Lint the files that install onto a device: the built commands/*.md and agents/*.md.
//
// Those files are read in somebody else's repository, by an agent that has no MyCommand
// checkout beside it. Three things in them read fine here and badly there:
//
//   repo-path  a link or path that resolves only inside this repo — a relative markdown link
//              out of its own directory, src/toolkit/…, src/hooks/…, src/shared/…, a named spec or a numbered ADR file.
//              A full URL is fine. Cite an ADR by number ("ADR 0011") and a spec by what it says.
//   history    wording that narrates how a command changed ("used to", "now refuses",
//              "before this flag existed", "recorded runs", "the old"). An installed command
//              states what to do; its history belongs in the changelog and the ADRs.
//   emphasis   more than EMPHASIS_CAP uppercase MUST/NEVER/CRITICAL in one file. The cap is the
//              largest count any file carries today (dev.md, 5): it stops the count growing
//              without forcing a rewrite of files that sit under it.
//
// A line a rule flags on purpose — an example of the wording an agent is told to avoid — goes
// in ALLOW with its reason. Keep that list short and reviewed; a new entry is a smell.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Uppercase MUST/NEVER/CRITICAL allowed per file: the current maximum (dev.md). */
export const EMPHASIS_CAP = 5;

/** @type {{rule: string, pattern: RegExp, message: string}[]} */
const LINE_RULES = [
  {
    rule: 'repo-path',
    // A sibling link (`[truncate](truncate.md)`) resolves wherever the commands install together;
    // one that leaves the directory does not.
    pattern: /\]\((?!https?:|mailto:|#|\/|~)[^)\s]*\/[^)\s]*\)/,
    message: 'relative markdown link out of its own directory; it resolves only inside the MyCommand repo',
  },
  {
    rule: 'repo-path',
    pattern: /(?<![\w/.-])src\/(?:toolkit|hooks|shared)\//,
    message: 'MyCommand source path; an installed command has no checkout to find it in',
  },
  {
    rule: 'repo-path',
    pattern: /(?<![\w/.-])docs\/specs\/(?!index\.md)[a-z0-9][a-z0-9-]*\.md\b/,
    message: 'named MyCommand spec; say what it states instead of where it lives',
  },
  {
    rule: 'repo-path',
    pattern: /(?<![\w/.-])docs\/adrs\/\d{4}-/,
    message: 'ADR file path; cite it by number ("ADR 0011")',
  },
  {
    rule: 'history',
    pattern: /\b(?<!\b(?:is|are|be|been|being|was|were|and|gets?) )used to\b/i,
    message: '"used to" narrates history; state the current behavior',
  },
  {
    rule: 'history',
    pattern: /\b(?:before|until) this \w+ existed\b/i,
    message: 'narrates when something was added; state the current behavior',
  },
  {
    rule: 'history',
    pattern: /\brecorded runs?\b/i,
    message: '"recorded run(s)" cites past runs; state the rule and its reason',
  },
  {
    rule: 'history',
    pattern: /\bthe old (?:version|behaviou?r|rule|wording|flow|command|form|way|name|path|shape|default)\b/i,
    message: '"the old" contrasts with a previous version; describe the current one',
  },
  {
    rule: 'history',
    // "X now refuses" is a then/now contrast; "as it is now" and "right now" are not.
    pattern:
      /\bnow (?:refuses|does|uses|carries|handles|owns|runs|lives|takes|returns|reports|checks|blocks|names|requires|writes|ships|asks)\b/i,
    message: '"now <verb>s" contrasts with an earlier version; drop "now"',
  },
];

const EMPHASIS = /\b(?:MUST|NEVER|CRITICAL)\b/g;

/**
 * Lines a rule flags deliberately. `file` is relative to the repo root.
 * @type {{file: string, rule: string, contains: string, reason: string}[]}
 */
export const ALLOW = [
  {
    file: 'agents/mycommand-doc-auditor.md',
    rule: 'history',
    contains: 'but the code now uses 40000',
    reason: 'quotes the then/now phrasing the auditor is told never to write',
  },
];

/**
 * @param {string} file path relative to the repo root, used in findings and the allowlist
 * @param {string} text
 * @param {{allow?: typeof ALLOW, cap?: number}} [opts]
 * @returns {{file: string, line: number, rule: string, message: string, text: string}[]}
 */
export function lint(file, text, opts = {}) {
  const allow = opts.allow ?? ALLOW;
  const cap = opts.cap ?? EMPHASIS_CAP;
  const findings = [];
  const lines = text.split('\n');
  let emphasis = 0;
  lines.forEach((line, i) => {
    emphasis += (line.match(EMPHASIS) ?? []).length;
    for (const { rule, pattern, message } of LINE_RULES) {
      if (!pattern.test(line)) continue;
      if (allow.some((a) => a.file === file && a.rule === rule && line.includes(a.contains))) continue;
      findings.push({ file, line: i + 1, rule, message, text: line.trim() });
    }
  });
  if (emphasis > cap) {
    findings.push({
      file,
      line: 0,
      rule: 'emphasis',
      message: `${emphasis} uppercase MUST/NEVER/CRITICAL; the cap is ${cap} per file`,
      text: '',
    });
  }
  return findings;
}

/** The installed surfaces: built commands and subagent definitions. */
export function sources(root = ROOT) {
  return ['commands', 'agents'].flatMap((dir) =>
    readdirSync(join(root, dir))
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => join(root, dir, f)),
  );
}

function main() {
  const files = sources();
  const findings = files.flatMap((f) => lint(relative(ROOT, f), readFileSync(f, 'utf8')));
  for (const f of findings) {
    const where = f.line ? `${f.file}:${f.line}` : f.file;
    process.stdout.write(`::error::${where} [${f.rule}] ${f.message}${f.text ? `\n    ${f.text}` : ''}\n`);
  }
  if (findings.length > 0) {
    process.stdout.write(
      `lint-commands: ${findings.length} finding(s). Fix them at their source in src/commands/ or src/shared/, then run ./scripts/build-plugin.sh.\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`lint-commands: ${files.length} installed file(s) clean.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
