// Flag coercion. A parsed flag is a string, a bare `true`, or an array when repeated;
// these narrow that union at the one place each verb reads it.

/**
 * The flag as a string, or undefined when absent or given without a value.
 * A repeated flag resolves to its last occurrence.
 * @param {string | boolean | string[] | undefined} value
 * @returns {string | undefined}
 */
export function str(value) {
  if (Array.isArray(value)) return value[value.length - 1];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Every occurrence of a repeatable flag.
 * @param {string | boolean | string[] | undefined} value
 * @returns {string[]}
 */
export function list(value) {
  if (Array.isArray(value)) return value;
  return typeof value === 'string' ? [value] : [];
}

/**
 * @param {string | boolean | string[] | undefined} value
 * @returns {boolean}
 */
export function bool(value) {
  return value === true || value === 'true';
}
