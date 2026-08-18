// Recognizing the Bash command shapes that fail for a known reason.
//
// Each function here answers about the command's *shape*, from evidence on this device —
// a glob that matches nothing, a `sleep` in the foreground, a heredoc composing a file.
// None of them guesses at intent: every shape below either fails outright when it runs or
// is refused by the harness.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

/** Binaries that dump a file's contents. `grep`/`rg` are absent: locating a symbol in a
 * file already in context is the faster form the re-read gate recommends. */
const DUMPERS = new Set(['cat', 'head', 'tail', 'sed', 'nl', 'less', 'more', 'bat']);

/** Characters that make a token's expansion something other than what is written. */
const UNJUDGEABLE = /[$`[\]{}~]|\*\*/;

/**
 * @typedef {object} Token
 * @property {string} text   The token with quotes stripped.
 * @property {boolean} quoted Any part of it was inside quotes, so the shell will not expand it.
 */

/**
 * Split a command the way a shell would, tracking which tokens were quoted. Quoting is the
 * whole question for the glob gate, so it cannot be answered by `split(/\s+/)`.
 * @param {string} command
 * @returns {Token[]}
 */
export function tokenize(command) {
  /** @type {Token[]} */
  const out = [];
  let text = '';
  let quoted = false;
  let started = false;
  /** @type {'"' | "'" | null} */
  let inside = null;

  const flush = () => {
    if (started) out.push({ text, quoted });
    text = '';
    quoted = false;
    started = false;
  };

  for (const ch of command) {
    if (inside) {
      if (ch === inside) inside = null;
      else text += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inside = ch;
      quoted = true;
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    started = true;
    text += ch;
  }
  flush();
  return out;
}

/**
 * Match a shell glob against one directory entry. Only `*` and `?` — a token carrying any
 * other pattern syntax is skipped by the caller rather than approximated here.
 * @param {string} pattern @param {string} name
 * @returns {boolean}
 */
function globMatches(pattern, name) {
  // zsh's `*` does not match a leading dot unless the pattern has one.
  if (name.startsWith('.') && !pattern.startsWith('.')) return false;
  const rx = new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')}$`,
  );
  return rx.test(name);
}

/**
 * The first unquoted glob in `command` that matches nothing from `cwd`, or null. zsh aborts
 * the whole command with `no matches found` in that case, so nothing in it runs — including
 * the parts that would have worked.
 * @param {string} command @param {string} cwd
 * @returns {string | null}
 */
export function unmatchedGlob(command, cwd) {
  // A heredoc body is literal text, and a redirection target is created rather than matched.
  if (command.includes('<<')) return null;

  for (const token of tokenize(command)) {
    const text = token.text;
    if (token.quoted) continue;
    if (!/[*?]/.test(text)) continue;
    if (UNJUDGEABLE.test(text)) continue;

    const cut = text.lastIndexOf('/');
    const dir = cut === -1 ? cwd : text.slice(0, cut) || '/';
    const pattern = cut === -1 ? text : text.slice(cut + 1);
    // A glob in the directory half needs the shell's own walk; not judged here.
    if (/[*?]/.test(dir) || !pattern) continue;

    const base = isAbsolute(dir) ? dir : resolve(cwd, dir);
    let names;
    try {
      names = readdirSync(base);
    } catch {
      // No such directory, or unreadable — the failure would not be the glob.
      continue;
    }
    if (names.some((name) => globMatches(pattern, name))) continue;
    return text;
  }
  return null;
}

/**
 * Separators that end up glued to the end of a glob when the pattern is composed rather than
 * recalled. Four recorded patterns carried a trailing `;` — `*.tsx;`, `*.stories.tsx;`,
 * `lib/aem-source/*.ts;`, `*.json;` — and one a trailing comma. Quoting such a pattern makes
 * the shell stop complaining and the program match nothing, which is worse than the abort.
 */
const STRAY_SEPARATOR = /[;,]+$/;

/**
 * A glob with any separator that was never part of the pattern removed, and the separator found.
 * @param {string} glob
 * @returns {{pattern: string, stray: string}}
 */
export function withoutStraySeparator(glob) {
  const found = STRAY_SEPARATOR.exec(glob);
  return { pattern: found ? glob.slice(0, found.index) : glob, stray: found ? found[0] : '' };
}

/** The grep family, whose `--include` is the recorded way a bare glob reaches a shell. */
const GREPS = new Set(['grep', 'egrep', 'fgrep', 'rgrep']);

/**
 * A `grep --include=<glob>` / `--exclude=<glob>` in this command, or null — whatever the quoting.
 * Unlike the unmatched-glob check this does not ask whether the pattern matches anything; the
 * caller refuses the shape itself.
 * @param {string} command
 * @returns {{flag: string, glob: string, bin: string} | null}
 */
export function grepIncludeGlob(command) {
  // Not split into segments first: splitting on `;` would strip a stray trailing one here while
  // the shell still sees it, so the whole command is tokenized and the separator is reported.
  const tokens = tokenize(command);
  const bin = tokens.map((t) => t.text.split('/').pop() ?? '').find((word) => GREPS.has(word));
  if (bin === undefined) return null;
  for (const token of tokens) {
    const m = /^--(include|exclude)=(.+)$/.exec(token.text);
    if (m && /[*?]/.test(m[2])) return { flag: `--${m[1]}`, glob: m[2], bin };
  }
  return null;
}

/**
 * The `sleep` invocation in a foreground command, or null. The harness blocks it, and blocks
 * the whole call with it, so a probe chained after the wait never runs either.
 * @param {string} command @param {boolean} background
 * @returns {string | null}
 */
export function foregroundSleep(command, background) {
  if (background) return null;
  for (const m of command.matchAll(/(?:^|[;&|(]\s*|&&\s*|\|\|\s*)(sleep\s+[\d.]+\w*)/g)) return m[1];
  return null;
}

/**
 * Whether the command composes a file from a heredoc. That shape is refused wholesale in an
 * isolated worktree, and the `Write` tool writes the same file with no shell involved.
 * @param {string} command
 * @returns {boolean}
 */
export function heredocWrite(command) {
  const opener = /<<-?\s*(["']?)([A-Za-z_]\w*)\1/.exec(command);
  if (!opener) return false;

  // A heredoc feeding a program's stdin with no redirect is deliberately untouched, so the
  // redirect has to be a real one. Two things that are not: a `>` inside the heredoc body,
  // which is data rather than shell syntax, and one inside a quoted argument — `sed 's/.*-> //'`
  // redirects nothing. So drop the body, then judge only what the shell itself reads.
  const delimiter = opener[2];
  const closes = new RegExp(`^\\s*${delimiter}\\s*$`);
  const opens = new RegExp(`<<-?\\s*["']?${delimiter}["']?`);
  /** @type {string[]} */
  const shell = [];
  let inBody = false;
  for (const line of command.split('\n')) {
    if (inBody) {
      if (closes.test(line)) inBody = false;
      continue;
    }
    shell.push(line);
    if (opens.test(line)) inBody = true;
  }

  const bare = tokenize(shell.join('\n'))
    .filter((t) => !t.quoted)
    .map((t) => t.text)
    .join(' ');
  return /(^|[^0-9<>&])>{1,2}([^>]|$)/.test(bare) || /\btee\b/.test(bare);
}

/** Binaries whose output is content the shell itself supplies, rather than a program's result. */
const COMPOSERS = new Set(['cat', 'echo', 'printf']);

/**
 * The file a command composes in the shell, or null. Wider than `heredocWrite`, which sees only a
 * heredoc: a composer redirected into a file is the same act, refused in the same places, and done
 * by the `Write` tool with no shell in the way.
 *
 * A redirect whose source is a real program's output is **not** this shape — that is capturing a
 * result, and refusing it would take the backgrounded log file the other gates depend on with it.
 * So the segment's first word has to be a composer, or the segment has to feed a heredoc into the
 * redirect.
 * @param {string} command
 * @returns {{target: string, how: 'heredoc' | 'composer'} | null}
 */
export function shellComposedWrite(command) {
  const heredoc = heredocWrite(command);
  for (const segment of command.split(/\|\||&&|[;\n]/)) {
    const tokens = tokenize(segment.trim());
    const bin = tokens[0]?.text.split('/').pop() ?? '';
    const redirect = />>?\s*("[^"]+"|'[^']+'|[^\s;&|<>]+)/.exec(segment);
    if (!redirect) continue;
    const target = redirect[1].replace(/^['"]|['"]$/g, '');
    // `2>&1` and friends duplicate a descriptor; `/dev/*` is not a document. A computed target
    // cannot be named, and the recorded one is the `$CLAUDE_JOB_DIR` scratch write no gate may
    // refuse.
    if (!target || target.startsWith('&') || target.startsWith('/dev/')) continue;
    if (/[$`]/.test(target)) continue;
    if (COMPOSERS.has(bin)) return { target, how: 'composer' };
    if (heredoc) return { target, how: 'heredoc' };
  }
  return heredoc ? { target: '', how: 'heredoc' } : null;
}

/**
 * The toolkit verbs that used to take their prose on stdin, and the flag that takes a path
 * instead. Reading stdin is what invites a heredoc, and a heredoc is refused wholesale in a
 * worktree — so the stdin form is named here in order to be refused before it is composed.
 */
const PROSE_FLAGS = [
  { verb: 'commit', flag: '--message', replacement: '--message-file' },
  { verb: 'pr', flag: '--body', replacement: '--body-file' },
];

/**
 * A `my-command-tools <verb> … <flag> -` invocation asking for its prose on stdin, or null.
 * The path-taking flag named in the result does the same job with no shell in the way.
 * @param {string} command
 * @returns {{verb: string, flag: string, replacement: string} | null}
 */
export function stdinProseFlag(command) {
  if (!command.includes('my-command-tools')) return null;
  const tokens = tokenize(command).map((t) => t.text);
  for (const spec of PROSE_FLAGS) {
    if (!tokens.includes(spec.verb)) continue;
    const at = tokens.indexOf(spec.flag);
    if (at !== -1 && tokens[at + 1] === '-') return spec;
    if (tokens.includes(`${spec.flag}=-`)) return spec;
  }
  return null;
}

/**
 * The hand-rolled half of post-merge branch cleanup in this command, or null. Both halves fail
 * for a reason settled before they run rather than discovered from their error: `git push
 * <remote> --delete` hits a ref GitHub's auto-delete setting already took, and `git branch -d`
 * calls a squash-merged branch unmerged because it shares no history with the branch's commits.
 * `my-command-tools cleanup` answers each half from the PR instead, so this reports the shape
 * and the caller names that verb. Only the *safe* local delete counts: `git branch -D` is a
 * deliberate discard, which `/merge-deps` prescribes to force a branch to be recreated from
 * origin, and refusing it would put this gate at odds with the docs.
 * @param {string} command
 * @returns {{half: 'remote' | 'local', branch: string, remote: string} | null}
 */
export function handRolledCleanup(command) {
  for (const segment of command.split(/\|\||&&|[;|\n]/)) {
    const tokens = tokenize(segment).map((t) => t.text);
    if ((tokens[0]?.split('/').pop() ?? '') !== 'git') continue;
    // `git -C <path>` and the other pre-subcommand options sit between `git` and the verb.
    const at = tokens.findIndex((t, i) => i > 0 && (t === 'push' || t === 'branch'));
    if (at === -1) continue;
    const rest = tokens.slice(at + 1);
    // A flag's own value, and anything the shell computes, make the branch unreadable here.
    const words = rest.filter((t) => !t.startsWith('-') && !UNJUDGEABLE.test(t) && !/[*?]/.test(t));

    if (tokens[at] === 'push') {
      if (!rest.includes('--delete') && !rest.includes('-d')) continue;
      // `git push <remote> --delete <branch>` in either order; a bare `--delete` names both.
      if (words.length !== 2) continue;
      return { half: 'remote', remote: words[0], branch: words[1] };
    }

    // `git branch --delete` is `-d`; `--force`/`-D` alongside it is the deliberate discard.
    if (!rest.includes('-d') && !rest.includes('--delete')) continue;
    if (rest.includes('-D') || rest.includes('--force')) continue;
    if (words.length !== 1) continue;
    return { half: 'local', remote: 'origin', branch: words[0] };
  }
  return null;
}

/** Inline-script runners: the whole program is an argument, so nothing on disk records it. */
const INLINE_SCRIPT = [
  { bin: /^(node|bun)$/, flags: new Set(['-e', '--eval', '-p', '--print']) },
  { bin: /^python3?$/, flags: new Set(['-c']) },
  { bin: /^deno$/, flags: new Set(['eval']) },
];

/** Tokens that end one command and begin another. */
const SEGMENT_BREAK = new Set(['|', '||', '&&', ';', '&', '|&']);

/** Calls whose argument names a destination rather than a source. */
const WRITE_CALL = /(?:writeFileSync|appendFileSync|createWriteStream|writeFile|outputJson|dump)\s*\(\s*$/;

/**
 * Whether an inline-script runner in this command is running a one-liner — `node -e`,
 * `python3 -c`, `deno eval`. The flag has to belong to the runner itself, with only the
 * runner's own options between them; a matching flag further along the pipeline is another
 * binary's.
 * @param {Token[]} tokens
 * @returns {boolean}
 */
function runsInlineScript(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    const bin = tokens[i].text.split('/').pop() ?? '';
    const spec = INLINE_SCRIPT.find((s) => s.bin.test(bin));
    if (!spec) continue;
    for (let j = i + 1; j < tokens.length; j++) {
      const next = tokens[j].text;
      if (spec.flags.has(next)) return true;
      if (SEGMENT_BREAK.has(next)) break;
      // The first argument that is not one of the runner's own options is the program.
      if (!next.startsWith('-')) break;
    }
  }
  return false;
}

/**
 * Existing `.json` files an inline one-liner in this command would parse. A one-liner
 * reaching into a JSON document it has never seen is written against a guessed shape, and
 * fails on the first key that is not there.
 * @param {string} command @param {string} cwd
 * @returns {string[]}
 */
export function inlineScriptJson(command, cwd) {
  const tokens = tokenize(command);
  if (!runsInlineScript(tokens)) return [];

  /** @type {string[]} */
  const out = [];
  let prev = '';
  for (const token of tokens) {
    // The path may sit inside the script text rather than as an argument of its own, so
    // every JSON-looking substring of every token is a candidate.
    for (const m of token.text.matchAll(/[\w./-]+\.json\b/g)) {
      // A destination, not a document: a redirect target, or the argument of a write call.
      if (/>>?$/.test(prev) || token.text.slice(0, m.index).endsWith('>')) continue;
      if (WRITE_CALL.test(token.text.slice(0, m.index).replace(/["'`]\s*$/, ''))) continue;
      const path = isAbsolute(m[0]) ? m[0] : resolve(cwd, m[0]);
      if (!out.includes(path) && existsSync(path)) out.push(path);
    }
    prev = token.text;
  }
  return out;
}

/**
 * `git diff` options that return a summary instead of hunks. What they report is not the
 * content `scope --diff` already returned, so narrowing one of them to a path re-fetches
 * nothing — `--quiet`/`--exit-code` return an exit code alone.
 */
const DIFF_NO_CONTENT = new Set([
  '--stat',
  '--numstat',
  '--shortstat',
  '--summary',
  '--quiet',
  '--exit-code',
  '--no-patch',
  '-s',
]);

/**
 * The single-path `git diff` / `gh pr diff` in this command, or null. Narrowing is the right
 * form on its own, so this reports the shape and the caller decides, refusing it only once
 * `scope --diff` has already returned that same content.
 *
 * Only a *single* path counts. Naming several in one call is the batched form
 * `batched-discovery` prescribes — the fix for walking a file list, not the walk — and
 * refusing it would leave the prose and this gate telling a run two different things.
 * @param {string} command
 * @returns {string | null}
 */
export function perPathDiff(command) {
  for (const segment of command.split(/[;&|]+/)) {
    const tokens = tokenize(segment).map((t) => t.text);
    const bin = tokens[0]?.split('/').pop() ?? '';
    if (bin !== 'git' && bin !== 'gh') continue;
    if (!tokens.includes('diff')) continue;
    // A name or stat listing carries no hunk content, so it is not a re-fetch of one.
    if (tokens.some((t) => t.startsWith('--name-') || DIFF_NO_CONTENT.has(t))) continue;
    // The index is a question `scope --diff` cannot have answered: it reports the branch and
    // the working tree, and nothing re-checks what was staged after it ran.
    if (tokens.includes('--cached') || tokens.includes('--staged')) continue;
    const sep = tokens.indexOf('--');
    const paths = sep === -1 ? [] : tokens.slice(sep + 1).filter(Boolean);
    if (paths.length !== 1) continue;
    return segment.trim();
  }
  return null;
}

/**
 * Whether this command invoked a toolkit verb with a given flag — `scope --diff`, say.
 * Used to tell "the content was already fetched" from "it never was".
 * @param {string} command @param {string} verb @param {string} flag
 * @returns {boolean}
 */
export function ranToolkit(command, verb, flag) {
  if (!command.includes('my-command-tools')) return false;
  const tokens = tokenize(command).map((t) => t.text);
  return tokens.includes(verb) && tokens.includes(flag);
}

/**
 * Blank the parts of one line the shell will not read as command syntax — a quoted span and a
 * trailing comment — keeping the line's length so an offset still points where it did. An
 * escaped quote is not tracked: over-blanking costs a missed construct, never a false one.
 * @param {string} line
 * @returns {string}
 */
function blank(line) {
  let out = '';
  /** @type {'"' | "'" | null} */
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      out += ch === quote ? ch : ' ';
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) return out + ' '.repeat(line.length - i);
    out += ch;
  }
  return out;
}

/**
 * The command with everything the shell treats as literal text blanked out: quoted spans,
 * comments, and heredoc bodies. Prose has to be able to *contain* a keyword without being
 * read as one, which is the whole reason a construct is matched against this rather than
 * against the raw command.
 * @param {string} command
 * @returns {string}
 */
function syntaxOnly(command) {
  /** @type {string[]} */
  const out = [];
  /** @type {string | null} */
  let heredoc = null;
  for (const line of command.split('\n')) {
    if (heredoc !== null) {
      const closes = line.trim() === heredoc;
      out.push(closes ? line : ' '.repeat(line.length));
      if (closes) heredoc = null;
      continue;
    }
    const opened = blank(line).match(/<<-?\s*["']?([A-Za-z_]\w*)["']?/);
    if (opened) heredoc = opened[1];
    out.push(blank(line));
  }
  return out.join('\n');
}

/**
 * Constructs that make a command a shell *program* rather than a call: the values its later
 * words expand to are computed by its own earlier words, so reading it cannot say what paths
 * it touches.
 *
 * The set is drawn from what the harness's worktree-isolation gate actually refuses, probed
 * one shape at a time from inside an isolated worktree rather than guessed: a loop whose body
 * uses the loop's own variable and a function definition are refused; an input redirect, an
 * `&&` short-circuit, a bare `$(( ))`, an assignment read by the next command, and two plain
 * commands on separate lines are all allowed. `if`/`&&` are deliberately absent for that
 * reason — they branch, but they compute nothing a reader cannot follow.
 */
const PROGRAM_CONSTRUCTS = [
  { kind: 'loop', re: /(?:^|[\n;&|(])\s*(for|while|until|select)\s/ },
  // The subject may be quoted, and `blank()` leaves spaces inside the quotes — so it is
  // matched as "anything up to the `in`" rather than as a single unbroken word.
  { kind: 'case branch', re: /(?:^|[\n;&|(])\s*(case)\s+[^\n;]*?\s+in\b/ },
  { kind: 'function definition', re: /(?:^|[\n;&|(])\s*(?:function\s+)?([A-Za-z_]\w*)\s*\(\)\s*\{/ },
];

/**
 * The construct that makes this command a shell program, or null. Used to hold the repo's own
 * documentation to a shape an agent can actually run: a snippet a command file tells an agent
 * to run is run from inside an isolated worktree, where the harness refuses what it cannot
 * statically resolve — so a snippet carrying one of these is a refusal the docs prescribed.
 *
 * It is not wired into the `PreToolUse` gate. The refusal it models is the harness's own and
 * already fires there; a second gate over the same shape could only refuse what is refused
 * anyway, and would be the one place these hooks guessed rather than knew.
 * @param {string} command
 * @returns {{kind: string, keyword: string} | null}
 */
export function shellProgram(command) {
  const text = syntaxOnly(command);
  for (const { kind, re } of PROGRAM_CONSTRUCTS) {
    const m = text.match(re);
    if (m) return { kind, keyword: m[1] };
  }
  return null;
}

/**
 * Absolute paths of existing files this command would dump in full or in part.
 * @param {string} command @param {string} cwd
 * @returns {string[]}
 */
export function dumpedFiles(command, cwd) {
  /** @type {string[]} */
  const out = [];
  for (const segment of command.split(/\|\||&&|[;|\n]/)) {
    // A redirect makes this a copy rather than a look: the contents are going somewhere.
    if (/[<>]/.test(segment)) continue;
    const tokens = tokenize(segment.trim());
    const bin = tokens[0]?.text;
    if (!bin || !DUMPERS.has(bin)) continue;
    for (const token of tokens.slice(1)) {
      const text = token.text;
      if (!text || text.startsWith('-')) continue;
      if (UNJUDGEABLE.test(text) || /[*?]/.test(text)) continue;
      const path = isAbsolute(text) ? text : resolve(cwd, text);
      try {
        if (!existsSync(path) || !statSync(path).isFile()) continue;
      } catch {
        continue;
      }
      out.push(path);
    }
  }
  return out;
}
