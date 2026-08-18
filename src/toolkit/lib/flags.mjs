// What a flag *is*, settled once at the argv boundary.
//
// `--flag`, `--flag=x`, `--flag x` and a repeated `--flag` are four spellings of one
// thing. `parseArgs` hands each flag's occurrences to `flag()` below, which resolves them
// into the three questions a verb ever asks: the flag's text, every occurrence, and
// whether it is on. Downstream reads a field, never a spelling.

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
    // Bare: no text, so a verb asking for one reads it as absent.
    if (only === undefined) return { text: undefined, all: [], on: true };
    return { text: only, all: [only], on: only === 'true' };
  }
  // A bare occurrence inside a repeated flag fills its slot as `true`.
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
