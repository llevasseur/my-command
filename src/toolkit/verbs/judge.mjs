// `judge` — ask one versioned question set about one state file, and print what came back.
//
// This verb is the seam between the two things the campaign has already landed: the question
// sets under `src/toolkit/judge/` say what to ask, and the client in `../lib/jev.mjs` knows how
// to ask it. Neither of them composes a request, and neither of them is reachable from a
// command line. This is.
//
// **It is wired into nothing.** `docs/adrs/0010-eval-harness-before-the-layer.md` puts the
// runtime surface — the second gate, the shadow store under `~/.my-command/judge/`, the spend
// cap threaded through a run — last in the ship order, after the eval numbers that decide
// whether any of it should exist. So this delivers a verb a person can run and nothing that
// runs it: no command calls it, no hook reads it, and no answer it returns changes any
// outcome. Running it by hand is the whole of its invocation surface.
//
// **`--dry-run` is a first-class path, not a debugging aid.**
// `docs/adrs/0009-conversation-derived-state-leaves-the-device.md` makes it the mechanism by
// which a human reads what leaves the device *before* it leaves — the state being judged is
// conversation-derived working material going to a third party, and an egress you can only
// describe is one nobody checks. It is also how the eval harness assembles requests without
// sending them. So the dry run and the live call compose the body through the same
// `buildRequest`, and there is deliberately no second code path that could drift from it.
//
// **Every failure fails open.** No key, a refused key, a timeout, a malformed response: the
// verb prints a result saying no answer was obtained and exits 0. A judge error must never
// change a run's outcome and must never fail a gate — the client is written never to throw for
// the same reason, and this verb's job is not to reintroduce the exception it removed. The two
// exits that are not 0 are both about the invocation rather than the answer: 2 for a usage
// error, 1 for a question set on disk this verb cannot read.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bool, str } from '../lib/flags.mjs';
import { ask, buildRequest, isHighConfidenceNoul, noulConfidence } from '../lib/jev.mjs';
import { ToolkitError, UsageError } from '../lib/proc.mjs';

export const usage = `judge --set <name> --state-file <path> [--dry-run]

Ask one versioned question set about one state file, and print the answers as JSON.

  --set <name>         A question set shipped at src/toolkit/judge/<name>.json.
  --state-file <path>  The state to judge, as a path. JSON is sent as JSON;
                       anything else is sent as text.
  --dry-run, -n        Print the exact request that would be sent and make no
                       network call. Nothing leaves the device.

Without --dry-run this sends the state file's contents to TypeSafe's System One
endpoint, which is a third party. That is the point of the verb and it is stated
here rather than buried: read docs/adrs/0009-conversation-derived-state-leaves-the-device.md,
or run the same invocation with --dry-run first and read the body yourself.

The API key is read from TYPESAFE_API_KEY in the environment and from nowhere
else. With no key set, nothing is sent and the result says so — that is the
ordinary case, not an error, and it still exits 0.

This verb is wired into no command. Nothing calls it, and no answer it returns
changes any outcome — see docs/adrs/0010-eval-harness-before-the-layer.md.

Exit codes: 0 always for an answer or a failed ask · 1 an unreadable question
set · 2 bad usage.`;

/** Where the versioned sets ship — beside this verb, not beside the caller's cwd. */
const SETS_DIR = fileURLToPath(new URL('../judge/', import.meta.url));

/**
 * A set name that cannot escape the sets directory. The name is joined onto a path, so an
 * unconstrained one reads any JSON file on the device; a set is a flat lowercase slug and
 * nothing else needs to be allowed.
 */
const SET_NAME = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Whether a decoded JSON value is an object with named fields, as against an array or a
 * scalar. `Object(value) === value` holds for an object and nothing else.
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return value !== null && Object(value) === value && !Array.isArray(value);
}

/**
 * The text a field carried, or undefined when it carried something that was not text.
 * `String(value) === value` holds for a string primitive and nothing else.
 * @param {unknown} value
 * @returns {string | undefined}
 */
function asText(value) {
  return String(value) === value ? /** @type {string} */ (value) : undefined;
}

/** The sets this verb can offer when the one asked for is not there. @returns {string[]} */
function availableSets() {
  try {
    return readdirSync(SETS_DIR)
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -'.json'.length))
      .sort();
  } catch {
    return [];
  }
}

/**
 * One question set, read off disk and checked far enough to compose a request from.
 * @param {string} name
 * @returns {Record<string, unknown>}
 */
function loadSet(name) {
  if (!SET_NAME.test(name)) {
    throw new UsageError(`--set must be a lowercase slug; \`${name}\` is not one`, {
      available: availableSets(),
    });
  }

  const path = join(SETS_DIR, `${name}.json`);
  /** @type {string} */
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new UsageError(`there is no question set named \`${name}\``, {
      path,
      available: availableSets(),
    });
  }

  /** @type {unknown} */
  let decoded;
  try {
    decoded = JSON.parse(text);
  } catch (cause) {
    // On disk and unreadable: this is the shipped set being wrong, not the caller.
    throw new ToolkitError(`the question set \`${name}\` is not valid JSON`, {
      path,
      detail: cause instanceof Error ? cause.message : String(cause),
    });
  }
  if (!isRecord(decoded)) {
    throw new ToolkitError(`the question set \`${name}\` is not an object`, { path });
  }
  return decoded;
}

/**
 * What one `noul` entry asks, as the instructions the client sends.
 *
 * The set writes the claim and how to read its poles as two fields, because a human reading
 * the set wants them apart. The endpoint takes one instructions string, so they are joined
 * here — and the join is visible in full under `--dry-run`, which is the only reason it is
 * acceptable for this verb to compose anything at all.
 * @param {Record<string, unknown>} question
 * @returns {string}
 */
function noulInstructions(question) {
  const claim = asText(question.noul);
  const means = asText(question.answerMeans);
  if (claim === undefined) return '';
  return means === undefined ? claim : `${claim}\n\n${means}`;
}

/**
 * The client's question map, built from the set's own shape.
 *
 * Two shapes ship today and both are handled: a `noul` set carries a `questions` array, each
 * entry its own yes/no claim; a `choice` set carries one `question` and an `options` list whose
 * rubrics are the criteria. An unrecognised `kind` is refused outright rather than guessed at —
 * a set this verb cannot read correctly must not be sent half-read.
 * @param {Record<string, unknown>} set
 * @param {string} name
 * @returns {Record<string, import('../lib/jev.mjs').JevQuestion>}
 */
function questionsFor(set, name) {
  const kind = asText(set.kind);

  if (kind === 'noul') {
    const entries = Array.isArray(set.questions) ? set.questions : [];
    if (entries.length === 0) {
      throw new ToolkitError(`the question set \`${name}\` carries no questions`, { kind });
    }
    /** @type {Record<string, import('../lib/jev.mjs').JevQuestion>} */
    const questions = {};
    for (const raw of entries) {
      if (!isRecord(raw)) continue;
      const id = asText(raw.id);
      const instructions = noulInstructions(raw);
      if (id === undefined || instructions === '') continue;
      questions[id] = { type: 'noul', instructions };
    }
    if (Object.keys(questions).length !== entries.length) {
      throw new ToolkitError(`the question set \`${name}\` has an entry with no id or no claim`, { kind });
    }
    return questions;
  }

  if (kind === 'choice') {
    const question = asText(set.question);
    const options = Array.isArray(set.options) ? set.options : [];
    if (question === undefined || options.length === 0) {
      throw new ToolkitError(`the question set \`${name}\` carries no question or no options`, { kind });
    }
    /** @type {Record<string, string | null>} */
    const criteria = {};
    for (const raw of options) {
      if (!isRecord(raw)) continue;
      const id = asText(raw.id);
      if (id === undefined) continue;
      criteria[id] = asText(raw.rubric) ?? null;
    }
    if (Object.keys(criteria).length !== options.length) {
      throw new ToolkitError(`the question set \`${name}\` has an option with no id`, { kind });
    }
    // The set's own name is the correlation key: a choice set asks exactly one question, so
    // there is nothing to tell apart, and the key comes back identical on `answers`.
    return { [name]: { type: 'choice', instructions: question, criteria } };
  }

  throw new ToolkitError(`the question set \`${name}\` has kind \`${kind ?? 'none'}\`, which this verb does not read`, {
    kind: kind ?? null,
    reads: ['noul', 'choice'],
  });
}

/**
 * The state to judge, read from the path it was named at.
 *
 * A path rather than stdin, for the reason `commit --message-file` and `pr --body-file` take
 * paths: the multi-line alternative is a heredoc, and the gate refuses a heredoc composing a
 * file wholesale inside a worktree — which is exactly where these runs work.
 * @param {string} path
 * @returns {{value: import('../lib/jev.mjs').JevState, form: string, bytes: number}}
 */
function readState(path) {
  /** @type {string} */
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (cause) {
    throw new UsageError(`--state-file could not be read: ${path}`, {
      detail: cause instanceof Error ? cause.message : String(cause),
    });
  }

  const bytes = Buffer.byteLength(text);
  if (text.trim() === '') {
    throw new UsageError(`--state-file is empty: ${path}`, { bytes });
  }

  // JSON when it decodes to something the endpoint takes as structured state; the raw text
  // otherwise. A bare number or string that happens to parse is still just text.
  try {
    /** @type {unknown} */
    const decoded = JSON.parse(text);
    if (decoded !== null && Object(decoded) === decoded) {
      return { value: /** @type {Record<string, unknown> | unknown[]} */ (decoded), form: 'json', bytes };
    }
  } catch {
    // Not JSON, which is fine and common: a précis is prose.
  }
  return { value: text, form: 'text', bytes };
}

/**
 * One answer, plus the confidence a `noul` implies.
 *
 * A noul carries no confidence field, so the band is derived — and derived by the client's own
 * exported helpers rather than recomputed here, so the definition of "high confidence" has
 * exactly one home.
 * @param {import('../lib/jev.mjs').JevAnswer} answer
 * @returns {Record<string, unknown>}
 */
function describeAnswer(answer) {
  if (answer.type !== 'noul') return { ...answer };
  return {
    ...answer,
    confidence: noulConfidence(answer.noul),
    highConfidence: isHighConfidenceNoul(answer.noul),
  };
}

/**
 * What the result says about itself, in a sentence, for whoever is reading it by eye. A judge
 * that answers nothing has to say so plainly when it is called directly; staying quiet is the
 * caller's job, and this verb has no caller.
 * @param {import('../lib/jev.mjs').JevResult} result
 * @returns {string}
 */
function noteFor(result) {
  if (result.ok) return 'The set was asked and answered. Nothing acts on this answer.';
  if (result.reason === 'no-key') {
    return (
      'TYPESAFE_API_KEY is not set in this environment, so no question was asked and nothing ' +
      'left this device. That is the ordinary case rather than a failure, which is why this ' +
      'exits 0. Run the same invocation with --dry-run to read the request it would have sent.'
    );
  }
  return (
    `No answer was obtained (${result.reason}). This exits 0 deliberately: a judge error must ` +
    'never change a run’s outcome or fail a gate.'
  );
}

/**
 * @param {import('../cli.mjs').Ctx} ctx
 * @param {typeof globalThis.fetch} [fetchImpl] Injected in tests, so the promise that no
 *   network call happens under --dry-run is asserted rather than described.
 */
export async function run(ctx, fetchImpl) {
  const name = str(ctx.flags.set);
  if (name === undefined) {
    throw new UsageError('judge needs --set <name>', { available: availableSets() });
  }
  const statePath = str(ctx.flags['state-file']);
  if (statePath === undefined) {
    throw new UsageError('judge needs --state-file <path>', { name });
  }
  // `-h` is the parser's only short flag, so `-n` arrives as a positional rather than as a
  // flag. Reading it here keeps the short spelling the plan asks for without widening the
  // shared parser — and therefore every other verb's argv — for one verb's switch.
  const dryRun = bool(ctx.flags['dry-run']) || ctx.positionals.includes('-n');

  const set = loadSet(name);
  const questions = questionsFor(set, name);
  const state = readState(statePath);

  /** Everything true of the run whether or not anything was sent. */
  const head = {
    set: asText(set.set) ?? name,
    version: asText(set.version) ?? null,
    kind: asText(set.kind) ?? null,
    title: asText(set.title) ?? null,
    // Restated from the set on every answer, because ADR 0008 makes nothing-acting the
    // safety mechanism and a reader should not have to open the set to confirm it.
    acts: set.acts === true,
    wiredInto: Array.isArray(set.wiredInto) ? set.wiredInto : [],
    questions: Object.keys(questions).length,
    state: { path: statePath, form: state.form, bytes: state.bytes },
  };

  // The body, composed once. The dry run prints this and the live call sends this — the same
  // value through the same function, so what a human reads is what would leave.
  const request = buildRequest(state.value, questions);

  if (dryRun) {
    return {
      ...head,
      dryRun: true,
      sent: false,
      request,
      requestBytes: Buffer.byteLength(JSON.stringify(request)),
      note:
        'Nothing was sent and no network call was made. `request` is the exact body this ' +
        'invocation would POST. The API key is never part of it — it travels as an ' +
        'Authorization header and is not printed here.',
    };
  }

  const result = await ask({ state: state.value, questions, fetchImpl });

  /** @type {Record<string, unknown>} */
  const answers = {};
  for (const [key, answer] of Object.entries(result.answers)) answers[key] = describeAnswer(answer);

  return {
    ...head,
    dryRun: false,
    sent: true,
    ok: result.ok,
    reason: result.reason,
    detail: result.detail,
    attempts: result.attempts,
    answered: Object.keys(answers).length,
    answers,
    usage: result.usage,
    note: noteFor(result),
  };
}
