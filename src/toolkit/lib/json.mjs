// Reading JSON that arrived from outside — a config file, stdin, an HTTP response.
//
// JSON admits six kinds of value and every reader in this toolkit wants exactly one of
// them: a record of named fields. Settling that once, at the point the text is parsed, is
// what lets the code downstream read fields instead of re-establishing what it was handed.

/**
 * The JSON value as a record of named fields, or null when the document is any of the
 * other things JSON allows — an array, a scalar, `null`.
 *
 * `JSON.parse` only ever produces plain objects, arrays, and scalars, so comparing the
 * prototype answers the question exactly and separates an array from a record, which is
 * the distinction a caller reaching for `.field` actually depends on.
 * @param {unknown} value
 * @returns {Record<string, unknown> | null}
 */
export function asRecord(value) {
  if (value === null || value === undefined) return null;
  return Object.getPrototypeOf(value) === Object.prototype ? /** @type {Record<string, unknown>} */ (value) : null;
}

/**
 * The same reading with an empty record for the absent case, for a caller that iterates
 * the fields rather than branching on whether there were any.
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
export function recordOrEmpty(value) {
  return asRecord(value) ?? {};
}
