#!/usr/bin/env node
// Hold this repo's own documentation to the shapes this repo's own gates accept.
//
// `/cp` step 3 prescribed a five-deep stash rotation as a `for i in 3 2 1` loop over
// `$((i + 1))` paths, and a worktree-isolated session refused it on every run — not for its
// paths, which were all under `~/.claude`, but for its shape, which cannot be resolved by
// reading it. The docs prescribed a refusal.
//
// One offending snippet is a bug; a repo that can grow another one silently is the defect.
// So every fenced shell block in the command sources, the shared snippets, and the Codex
// skills is run through the same shape checker the `PreToolUse` gate uses, plus the
// construct model in `shellProgram()`, and a block a run could not execute fails the check.
//
// A block nobody is being told to *run* is exempt, but has to say so: put
// `<!-- not-run: <reason> -->` on the line above the fence. Shell that a human pastes into
// `~/.zshrc`, and a file template an agent writes rather than executes, are the two real
// cases — and both have to be declared rather than inferred, because nothing in a fence
// distinguishes them from an instruction.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { foregroundSleep, heredocWrite, shellProgram, stdinProseFlag } from '../src/hooks/lib/bash-shapes.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Info strings that mean "this fence holds shell". */
const SHELL_LANGS = new Set(['bash', 'sh', 'shell', 'zsh']);

/** The marker that declares a fence is not something an agent is told to run. */
const NOT_RUN = /<!--\s*not-run:\s*(.+?)\s*-->/;

/**
 * Every markdown file whose fences are instructions to an agent: the command sources, the
 * shared snippets they include, and the Codex skills that translate them. `commands/` is
 * generated from `src/commands/`, so checking it too would only report the same snippet twice.
 * @returns {string[]}
 */
function sources() {
  /** @type {string[]} */
  const out = [];
  for (const dir of ['src/commands', 'src/shared']) {
    for (const name of readdirSync(join(ROOT, dir))) {
      if (name.endsWith('.md')) out.push(join(ROOT, dir, name));
    }
  }
  for (const name of readdirSync(join(ROOT, 'skills'), { withFileTypes: true })) {
    if (name.isDirectory()) out.push(join(ROOT, 'skills', name.name, 'SKILL.md'));
  }
  return out;
}

/**
 * @typedef {object} Block
 * @property {string} file    Repo-relative path.
 * @property {number} line    1-indexed line of the opening fence.
 * @property {string} body    The fence's contents, with its common indentation removed.
 * @property {string | null} exempt The stated reason this fence is not run, or null.
 */

/**
 * The fenced shell blocks in one file. A fence is matched with its own indentation, so a
 * block nested inside a list item closes on its own closing fence rather than on the next
 * one at column 0.
 * @param {string} file @param {string} text
 * @returns {Block[]}
 */
export function shellBlocks(file, text) {
  const lines = text.split('\n');
  /** @type {Block[]} */
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(/^(\s*)```+\s*([A-Za-z]*)\s*$/);
    if (!open || !SHELL_LANGS.has(open[2].toLowerCase())) continue;
    const indent = open[1];

    let close = i + 1;
    while (close < lines.length && !new RegExp(`^${indent}\`\`\`+\\s*$`).test(lines[close])) close++;

    // The marker sits on the nearest preceding non-blank line, so a fence may be introduced
    // by prose and still be declared.
    let above = i - 1;
    while (above >= 0 && lines[above].trim() === '') above--;
    const declared = above >= 0 ? lines[above].match(NOT_RUN) : null;

    out.push({
      file: relative(ROOT, file),
      line: i + 1,
      body: lines
        .slice(i + 1, close)
        .map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l))
        .join('\n')
        .trim(),
      exempt: declared ? declared[1] : null,
    });
    i = close;
  }
  return out;
}

/**
 * The snippet as the shell will actually receive it, with every `<placeholder>` replaced by a
 * value. A run substitutes those before it runs anything, and the gates judge what it sends —
 * so judging the unsubstituted text reports a shape that never reaches a shell. It is not
 * hypothetical: `pbcopy <<'EOF'` / `<the sentence>` / `EOF` reads as a heredoc *redirect*
 * purely because the placeholder ends in `>`, and that snippet runs fine.
 * @param {string} body
 * @returns {string}
 */
export function substituted(body) {
  return body.replace(/<[^<>\n]+>/g, 'VALUE');
}

/**
 * Why the gates would refuse this snippet, or null. Each entry is a shape that is refused
 * before the command runs, so the block is one an agent following the docs cannot execute.
 * @param {string} raw
 * @returns {{shape: string, fix: string} | null}
 */
export function refusal(raw) {
  const body = substituted(raw);
  const program = shellProgram(body);
  if (program) {
    return {
      shape: `a ${program.kind} (\`${program.keyword}\`) makes this a shell program, not a call`,
      fix:
        'A worktree-isolated session refuses what it cannot statically resolve. Give the ' +
        'work a name — a `my-command-tools` verb is one allowlisted command the gate can ' +
        'read — or break it into plain, separate commands.',
    };
  }

  const stdin = stdinProseFlag(body);
  if (stdin) {
    return {
      shape: `\`${stdin.verb} ${stdin.flag} -\` reads its prose from stdin`,
      fix: `Write the prose to a file and pass \`${stdin.replacement} <absolute path>\`.`,
    };
  }

  if (heredocWrite(body)) {
    return {
      shape: 'a heredoc composes a file',
      fix: 'That shape is refused wholesale inside an isolated worktree. Use the `Write` tool.',
    };
  }

  const sleeping = foregroundSleep(body, false);
  if (sleeping) {
    return {
      shape: `\`${sleeping}\` waits in the foreground`,
      fix: 'The harness refuses the whole call. Wait on the condition with `Monitor` instead.',
    };
  }

  return null;
}

function main() {
  /** @type {string[]} */
  const problems = [];
  let checked = 0;

  for (const file of sources()) {
    for (const block of shellBlocks(file, readFileSync(file, 'utf8'))) {
      if (block.exempt) continue;
      checked++;
      const bad = refusal(block.body);
      if (!bad) continue;
      problems.push(
        `${block.file}:${block.line} — ${bad.shape}.\n` +
          `${block.body
            .split('\n')
            .map((l) => `    ${l}`)
            .join('\n')}\n` +
          `  ${bad.fix}\n` +
          '  If nothing is being told to run this, say so above the fence with ' +
          '`<!-- not-run: <reason> -->`.',
      );
    }
  }

  if (problems.length > 0) {
    for (const p of problems) {
      process.stdout.write(`::error::${p}\n`);
    }
    process.stdout.write(`check-doc-snippets: ${problems.length} snippet(s) the workflow gates would refuse.\n`);
    process.exit(1);
  }
  process.stdout.write(`check-doc-snippets: ${checked} runnable shell snippet(s) pass the gates.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
