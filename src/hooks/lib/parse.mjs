// Decoding the JSON a hook is handed — the event on stdin, a transcript line, the device's
// settings file, the ledger's reply — into values whose contract is settled once, here.
// A field that was not the text it claimed to be is **absent** by the time a gate sees it,
// and absence is an answer every gate already has: no opinion, allow the call.
//
// The tests are exact rather than approximate: `String(value) === value` holds for a string
// primitive and nothing else, `Object(value) === value` for an object and nothing else.

/**
 * Whether a decoded JSON value is an object with named fields — as against an array, a
 * primitive, or null.
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
export function isRecord(value) {
  return value !== null && Object(value) === value && !Array.isArray(value);
}

/**
 * A JSON object's fields, or no fields at all when the value was something else.
 * @param {unknown} value
 * @returns {Record<string, any>}
 */
export function asRecord(value) {
  return isRecord(value) ? value : {};
}

/**
 * The text a field carried, or undefined when it carried something that was not text.
 *
 * Absence is kept distinct from `''` rather than collapsed into it: an empty string is a value
 * a caller can legitimately send, and the gates answer the two differently.
 * @param {unknown} value
 * @returns {string | undefined}
 */
export function asText(value) {
  return String(value) === value ? /** @type {string} */ (value) : undefined;
}

/**
 * The text a field carried, or `''` when it carried anything else. For the fields the harness
 * always sends as text, where "absent" and "empty" mean the same thing to every reader.
 * @param {unknown} value
 * @returns {string}
 */
export function text(value) {
  return asText(value) ?? '';
}
