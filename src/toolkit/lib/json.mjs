// Reading JSON that arrived from outside — a config file, stdin, an HTTP response.
//
// JSON admits six kinds of value and every reader here wants one: a record of named
// fields. Settled once where the text is parsed, so downstream reads fields.

/**
 * The JSON value as a record of named fields, or null for anything else JSON allows — an
 * array, a scalar, `null`.
 *
 * `JSON.parse` yields only plain objects, arrays and scalars, so the prototype separates
 * an array from a record exactly — the distinction a caller reaching for `.field` needs.
 * @param {unknown} value
 * @returns {Record<string, unknown> | null}
 */
export function asRecord(value) {
  if (value === null || value === undefined) return null;
  return Object.getPrototypeOf(value) === Object.prototype ? /** @type {Record<string, unknown>} */ (value) : null;
}

/**
 * The same reading, with an empty record for the absent case.
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
export function recordOrEmpty(value) {
  return asRecord(value) ?? {};
}
