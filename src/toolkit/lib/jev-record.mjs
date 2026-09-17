// A local recording proxy for Jev traffic: one `node:http` server that stands between a
// caller and TypeSafe's System One endpoint, forwards each request untouched, relays each
// response untouched, and writes down the whole exchange on the way past.
//
// **Why anything at all sits here.** The client in `jev.mjs` is written never to throw, and
// every one of its failure modes resolves to a result carrying an empty answer map — no key,
// a refused key, a 422, a timeout, an unreadable body. That is deliberate and
// `docs/adrs/0013-the-eval-bar-is-pre-registered.md` fixes it as the layer's contract. Its
// cost is that the three things an eval most needs to tell apart look identical at the call
// site: a 401, a 422, and a model that answered 7 of 125 questions all arrive as "no answers".
// A recorder that lives *outside* the client is the only place that distinction survives, and
// it has to be outside the client rather than a flag on it, because a client that reported its
// own failures would be a client that has opinions about them.
//
// **Nothing here judges, retries, or repairs.** The proxy is a wire tap. It does not parse a
// question set, does not read an answer, does not retry a 429, and never synthesises a
// response the endpoint did not send. The one thing it changes about a request is the
// `Authorization` header, and only to supply one the caller did not send.
//
// **Pointing Jev at it is a parameter, not a rewrite.** `ask()` already takes an `endpoint`
// defaulting to the exported `ENDPOINT` constant, so a caller records by passing
// `endpoint: <the proxy url>` and changes nothing else. `jev.mjs` is untouched by this file.
//
// **The key is read from the environment and forwarded; it is never written down.** Every
// record goes through `jev-record-store.mjs`'s redaction before it is written, both by header
// name and by literal scan of the decoded body — the second being what catches an endpoint
// that echoes a rejected key back inside its 401.
//
// Zero runtime dependencies: `node:http` and global `fetch`, nothing added to `package.json`.

import { createServer } from 'node:http';
import { ENDPOINT } from './jev.mjs';
import { RECORD_VERSION, redactHeaders, redactValue, secretsFrom, writeRecord } from './jev-record-store.mjs';

/** The endpoint this proxy stands in front of, re-exported so a caller names it once. */
export { ENDPOINT };

/** Where the proxy binds. Loopback only — this is a local tap, never a network service. */
export const HOST = '127.0.0.1';

/** How long the proxy waits on the upstream before recording the attempt as a timeout. */
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * The largest request body the proxy will hold in memory. A Jev request is a question map and
 * a state digest; anything past this is not one, and an unbounded read is a way to be killed
 * by a caller rather than by the endpoint.
 */
const MAX_BODY_BYTES = 32 * 1024 * 1024;

/** Headers a proxy must not copy onward: they describe *this* hop, not the request. */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

/** The path a caller may GET to ask whether the proxy is up. Never recorded. */
export const HEALTH_PATH = '/__jev-record';

/**
 * Whether a decoded JSON value is a record of named fields.
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return value !== null && Object(value) === value && !Array.isArray(value);
}

/**
 * The finite number a field carried, or null for anything else — including `NaN`, which is a
 * number nobody can total.
 * @param {unknown} value
 * @returns {number | null}
 */
function asNumber(value) {
  return Number.isFinite(value) ? /** @type {number} */ (value) : null;
}

/**
 * The keys of a map field, or an empty list when the field was not a map. Used for both the
 * question map and the answer map, which is what makes the two counts comparable.
 * @param {unknown} value
 * @returns {string[]}
 */
function keysOf(value) {
  return isRecord(value) ? Object.keys(value) : [];
}

/**
 * JSON, parsed, or undefined when the text was not JSON. Undefined rather than null because
 * `null` is itself a JSON body and the record distinguishes the two.
 * @param {string} text
 * @returns {unknown}
 */
function decode(text) {
  if (text === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * The usage counts a response reported, or null when it reported none. Null rather than zeroes:
 * a call whose cost is unknown and a call that cost nothing are different facts, and an eval
 * totalling spend across records must not add a guess to a sum.
 * @param {unknown} body
 * @returns {{input_tokens: number, output_tokens: number} | null}
 */
function usageOf(body) {
  if (!isRecord(body) || !isRecord(body.usage)) return null;
  const input = asNumber(body.usage.input_tokens);
  const output = asNumber(body.usage.output_tokens);
  if (input === null && output === null) return null;
  return { input_tokens: input ?? 0, output_tokens: output ?? 0 };
}

/**
 * Headers as a flat map of lowercase name to value. Node hands a repeated header back as an
 * array; joining with `, ` is what the HTTP grammar already says a repeated header means.
 * @param {import('node:http').IncomingHttpHeaders} headers
 * @returns {Record<string, string>}
 */
function flatten(headers) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    out[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return out;
}

/**
 * The whole request body as text, or a rejection when the caller sends more than the cap.
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<string>}
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error(`request body exceeded ${MAX_BODY_BYTES} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * One exchange, as it is written to disk.
 *
 * The shape is the contract two downstream readers parse — the eval harness in this repo and
 * an ingest pass in another — and it is specified in `docs/specs/command-toolkit.md` rather
 * than only here, because the reader in another repository cannot be changed in this commit.
 *
 * Everything is recorded in full and nothing is summarised away, with one exception that runs
 * before this function: secrets. `request.questions` and `response.answers` are the maps
 * themselves, and the counts beside them are conveniences over those maps rather than a
 * replacement for them — which is what lets a reader tell 7-of-125 from 125-of-125 without
 * trusting the recorder's arithmetic.
 *
 * @param {object} exchange
 * @param {number} exchange.sequence
 * @param {string} exchange.session
 * @param {string} exchange.endpoint
 * @param {number} exchange.startedAt Epoch milliseconds.
 * @param {number} exchange.endedAt Epoch milliseconds.
 * @param {string} exchange.method
 * @param {string} exchange.path The path on the *proxy*, which a caller may have varied.
 * @param {Record<string, string>} exchange.requestHeaders
 * @param {string} exchange.requestText
 * @param {number | null} exchange.status Null when no HTTP response arrived at all.
 * @param {Record<string, string>} exchange.responseHeaders
 * @param {string} exchange.responseText
 * @param {{name: string, message: string} | null} exchange.error Transport failure, or null.
 * @param {readonly string[]} exchange.secrets
 * @returns {Record<string, unknown>}
 */
export function buildRecord(exchange) {
  const { secrets } = exchange;
  const requestBody = decode(exchange.requestText);
  const responseBody = decode(exchange.responseText);

  const questions = isRecord(requestBody) ? requestBody.questions : undefined;
  const answers = isRecord(responseBody) ? responseBody.answers : undefined;
  const questionIds = keysOf(questions);
  const answeredIds = keysOf(answers);

  return {
    v: RECORD_VERSION,
    id: exchange.sequence,
    session: exchange.session,
    startedAt: new Date(exchange.startedAt).toISOString(),
    endedAt: new Date(exchange.endedAt).toISOString(),
    durationMs: exchange.endedAt - exchange.startedAt,
    endpoint: exchange.endpoint,
    request: {
      method: exchange.method,
      path: exchange.path,
      headers: redactHeaders(exchange.requestHeaders, secrets),
      bytes: Buffer.byteLength(exchange.requestText),
      model: isRecord(requestBody) && String(requestBody.model) === requestBody.model ? requestBody.model : null,
      state: isRecord(requestBody) ? (redactValue(requestBody.state, secrets) ?? null) : null,
      questions: questions === undefined ? null : redactValue(questions, secrets),
      questionCount: questionIds.length,
      questionIds,
      body: requestBody === undefined ? null : redactValue(requestBody, secrets),
      // Only when the body was not JSON, so a reader never has to decide which of two fields
      // is authoritative for one request.
      bodyText:
        requestBody === undefined && exchange.requestText !== '' ? redactValue(exchange.requestText, secrets) : null,
    },
    response: {
      status: exchange.status,
      ok: exchange.status !== null && exchange.status >= 200 && exchange.status < 300,
      headers: redactHeaders(exchange.responseHeaders, secrets),
      bytes: Buffer.byteLength(exchange.responseText),
      answers: answers === undefined ? null : redactValue(answers, secrets),
      answerCount: answeredIds.length,
      answeredIds,
      // The 7-of-125 signal, named rather than left to be derived: a reader that had to
      // subtract two lists would be a reader that could subtract them differently.
      unansweredIds: questionIds.filter((id) => !answeredIds.includes(id)),
      usage: usageOf(responseBody),
      body: responseBody === undefined ? null : redactValue(responseBody, secrets),
      // Where a 401's or a 422's error text lands when the endpoint sent prose rather than
      // JSON. A JSON error body is on `body` instead, unchanged and complete.
      bodyText:
        responseBody === undefined && exchange.responseText !== '' ? redactValue(exchange.responseText, secrets) : null,
      error: exchange.error,
    },
  };
}

/**
 * The headers to send upstream: the caller's own, minus the ones that describe this hop, plus
 * an `Authorization` supplied from the environment when — and only when — the caller sent none.
 *
 * Supplying rather than overriding is the point. A caller that already holds a key keeps using
 * it, and a caller that holds none (the ordinary case, since the proxy is what has the
 * environment) is authorised without ever learning the key.
 * @param {Record<string, string>} headers
 * @param {string | undefined} key
 * @returns {Record<string, string>}
 */
export function forwardHeaders(headers, key) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [name, value] of Object.entries(headers)) {
    if (HOP_BY_HOP.has(name.toLowerCase())) continue;
    out[name] = value;
  }
  if (out.authorization === undefined && key !== undefined && key !== '') out.authorization = `Bearer ${key}`;
  if (out['content-type'] === undefined) out['content-type'] = 'application/json';
  return out;
}

/**
 * Start the recording proxy.
 *
 * Resolves once the server is listening, with the URL to hand to `ask({ endpoint })`. Nothing
 * is recorded until a request arrives, and every request is recorded — including one the
 * upstream never answered, which is the case a caller reading `ask()`'s result cannot see.
 *
 * @param {object} options
 * @param {string} options.dir The session directory, already created.
 * @param {string} options.session The session's name, stamped onto every record.
 * @param {number} [options.port] 0, the default, takes an ephemeral port from the kernel.
 * @param {string} [options.endpoint] Upstream. Defaults to the client's own `ENDPOINT`.
 * @param {string | undefined} [options.key] Defaults to `TYPESAFE_API_KEY` from the
 *   environment, which is the only place it is ever read from.
 * @param {number} [options.timeoutMs]
 * @param {typeof globalThis.fetch} [options.fetchImpl] Injected in tests, so no test here
 *   makes a real network call.
 * @param {(record: Record<string, unknown>) => void} [options.onRecord] Called after each
 *   record is written. The `--exchanges` ceiling is built on it.
 * @returns {Promise<{url: string, port: number, recorded: () => number,
 *   close: () => Promise<void>}>}
 */
export async function startProxy({
  dir,
  session,
  port = 0,
  endpoint = ENDPOINT,
  key = process.env.TYPESAFE_API_KEY,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
  onRecord,
}) {
  let sequence = 0;

  const server = createServer((req, res) => {
    void handle(req, res);
  });

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @returns {Promise<void>}
   */
  async function handle(req, res) {
    const path = req.url ?? '/';
    const method = req.method ?? 'GET';

    // The liveness probe answers about the proxy itself, so forwarding it upstream would
    // record an exchange nobody asked for and ask the endpoint a question it does not take.
    if (method === 'GET' && path.startsWith(HEALTH_PATH)) {
      const body = JSON.stringify({ ok: true, session, dir, endpoint, recorded: sequence });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(body);
      return;
    }

    const startedAt = Date.now();
    /** @type {string} */
    let requestText;
    try {
      requestText = await readBody(req);
    } catch (cause) {
      res.writeHead(413, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: cause instanceof Error ? cause.message : String(cause) }));
      return;
    }

    const requestHeaders = flatten(req.headers);
    // A key the caller supplied is a secret this process never held; scrubbing is widened to
    // cover it before anything about this exchange is written.
    const exchangeSecrets = secretsFrom([key, requestHeaders.authorization]);

    /** @type {number | null} */
    let status = null;
    /** @type {Record<string, string>} */
    let responseHeaders = {};
    let responseText = '';
    /** @type {{name: string, message: string} | null} */
    let error = null;

    try {
      const upstream = await fetchImpl(endpoint, {
        method,
        headers: forwardHeaders(requestHeaders, key),
        body: method === 'GET' || method === 'HEAD' ? undefined : requestText,
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = upstream.status;
      upstream.headers.forEach((value, name) => {
        responseHeaders[name.toLowerCase()] = value;
      });
      responseText = await upstream.text();
    } catch (cause) {
      // No HTTP response at all — DNS, a refused connection, a timeout. The record says so
      // with `status: null` and an `error`, which is the one shape a reader cannot confuse
      // with an endpoint that answered badly.
      error = {
        name: cause instanceof Error ? cause.name : 'Error',
        message: cause instanceof Error ? cause.message : String(cause),
      };
      responseHeaders = {};
    }

    sequence += 1;
    const record = buildRecord({
      sequence,
      session,
      endpoint,
      startedAt,
      endedAt: Date.now(),
      method,
      path,
      requestHeaders,
      requestText,
      status,
      responseHeaders,
      responseText,
      error,
      secrets: exchangeSecrets,
    });
    writeRecord(dir, sequence, record);
    onRecord?.(record);

    if (res.writableEnded) return;
    if (status === null) {
      // 502 rather than a synthesised success: the client's taxonomy reads it as `http`, and
      // inventing an empty answer map here would be the proxy telling the exact lie it exists
      // to expose.
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: `the recording proxy could not reach ${endpoint}`, detail: error }));
      return;
    }
    /** @type {Record<string, string>} */
    const relayed = {};
    for (const [name, value] of Object.entries(responseHeaders)) {
      if (HOP_BY_HOP.has(name) || name === 'content-encoding') continue;
      relayed[name] = value;
    }
    res.writeHead(status, relayed);
    res.end(responseText);
  }

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, () => resolve(undefined));
  });

  // A pipe address is a string and carries no port, so `?.port` is the whole parse.
  const bound = Number(/** @type {{port?: number}} */ (server.address())?.port ?? 0);

  return {
    url: `http://${HOST}:${bound}`,
    port: bound,
    recorded: () => sequence,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve(undefined));
        // Without this a keep-alive connection from a client that has not exited holds the
        // close open, and a proxy asked to stop simply never does.
        server.closeAllConnections?.();
      }),
  };
}
