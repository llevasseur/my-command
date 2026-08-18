// What a flag *is*, settled once at the argv boundary.
//
// `--flag`, `--flag=x`, `--flag x`, and a `--flag` repeated three times are four spellings
// of the same command line, and every verb used to re-decide what it had been handed at
// the point it read one. `parseArgs` collects a flag's occurrences and hands them to
// `flag()` below, which resolves them into the three questions a verb ever asks: the
// flag's text, every occurrence it collected, and whether it is switched on. Downstream
// reads a field of that value; nothing re-derives the spelling it came from.

/**
 * One flag, as resolved from the command line.
 * @typedef {object} Flag
 * @property {string | undefined} text  Its value, or undefined when it was given bare.
 * @property {string[]} all             Every occurrence, in the order they were given.
 * @property {boolean} on               Switched on — given bare, or given the value `true`.
 */

/**
 * Resolve one flag's occurrences into its value. Each entry is the text that occurrence
 * carried, or `undefined` for an occurrence given bare.
 *
 * A flag given once is either a value or a switch. A flag given more than once is a list,
 * and a list is neither: its text is the last occurrence, and it is not a switch.
 * @param {(string | undefined)[]} occurrences
 * @returns {Flag}
 */
export function flag(occurrences) {
  if (occurrences.length === 1) {
    const only = occurrences[0];
    // Bare: it carries no text at all, so a verb asking for one correctly reads it as absent.
    if (only === undefined) return { text: undefined, all: [], on: true };
    return { text: only, all: [only], on: only === 'true' };
  }
  // A bare occurrence inside a repeated flag still fills a slot, and `true` is the text
  // that has always stood for it.
  const all = occurrences.map((occurrence) => occurrence ?? 'true');
  return { text: all[all.length - 1], all, on: false };
}

/**
 * A whole flag record built from plain values, for a caller that composes an invocation
 * rather than parsing one: `true` for a switch, a string for a value, an array for a flag
 * given more than once.
 * @param {Record<string, string | true | string[]>} given
 * @returns {Record<string, Flag>}
 */
export function flagsFrom(given) {
  /** @type {Record<string, Flag>} */
  const out = {};
  for (const [key, value] of Object.entries(given)) out[key] = flag(value === true ? [undefined] : [value].flat());
  return out;
}

/**
 * The flag as a string, or undefined when it is absent or was given without a value.
 * A repeated flag resolves to its last occurrence.
 * @param {Flag | undefined} value
 * @returns {string | undefined}
 */
export function str(value) {
  return value?.text;
}

/**
 * Every occurrence of a repeatable flag.
 * @param {Flag | undefined} value
 * @returns {string[]}
 */
export function list(value) {
  return value?.all ?? [];
}

/**
 * Whether a switch is on.
 * @param {Flag | undefined} value
 * @returns {boolean}
 */
export function bool(value) {
  return value?.on ?? false;
}
