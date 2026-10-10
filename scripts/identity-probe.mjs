import path from 'node:path';
import { fileURLToPath } from 'node:url';

function previewOrigin(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash
    )
      return url.origin;
  } catch {
    // The caller receives the same safe configuration error for every invalid URL.
  }
  throw new Error('Invalid identity probe configuration');
}

async function errorCode(response) {
  if (!/^application\/json\b/i.test(response.headers.get('content-type') ?? '')) {
    await response.body?.cancel().catch(() => undefined);
    return undefined;
  }
  if (!response.body) return undefined;
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4096) return undefined;
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))?.error?.code;
  } catch {
    return undefined;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function runIdentityProbe(environment, fetchImpl = fetch, now = Date.now) {
  if (
    environment.IDENTITY_PROBE_CONFIRM !== 'protected-preview' ||
    typeof environment.PROBE_API_BYPASS !== 'string' ||
    !environment.PROBE_API_BYPASS ||
    typeof environment.PROBE_WEB_BYPASS !== 'string' ||
    !environment.PROBE_WEB_BYPASS
  )
    throw new Error('Invalid identity probe configuration');
  const api = previewOrigin(environment.PROBE_API_ORIGIN);
  const web = previewOrigin(environment.PROBE_WEB_ORIGIN);
  if (api === web) throw new Error('Invalid identity probe configuration');

  // Bootstrap only the web ingress. Its cookie never goes to the API origin.
  const bootstrap = await fetchImpl(`${web}/`, {
    headers: {
      'x-vercel-protection-bypass': environment.PROBE_WEB_BYPASS,
      'x-vercel-set-bypass-cookie': 'true',
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
  });
  const cookie = bootstrap.headers
    .getSetCookie()
    .map((value) => value.split(';', 1)[0])
    .join('; ');
  await bootstrap.body?.cancel();
  if (
    (bootstrap.status !== 200 && !(bootstrap.status >= 300 && bootstrap.status < 400)) ||
    !cookie ||
    cookie.length > 8192
  )
    return { ok: false, apiDirect: 'inconclusive', webRewrite: 'not_run' };

  const bucket = Math.floor(now() / 60_000);
  async function sample(base, urlPath, index, rewrite) {
    if (Math.floor(now() / 60_000) !== bucket) return 'inconclusive';
    const forgedIp = `198.51.100.${index + 1}`;
    let response;
    try {
      response = await fetchImpl(`${base}${urlPath}`, {
        headers: {
          accept: 'application/json',
          'x-forwarded-for': forgedIp,
          'x-vercel-forwarded-for': forgedIp,
          'x-vercel-protection-bypass': environment.PROBE_API_BYPASS,
          ...(rewrite ? { cookie } : {}),
        },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      return 'inconclusive';
    }
    const code = await errorCode(response);
    if (
      Math.floor(now() / 60_000) !== bucket ||
      response.headers.get('cache-control') !== 'private, no-store'
    )
      return 'inconclusive';
    if (response.status === 400 && code === 'VALIDATION_ERROR') return 'validation';
    if (response.status === 429 && code === 'RATE_LIMITED') return 'rate_limited';
    return 'inconclusive';
  }

  async function group(base, urlPath, limit, firstIndex, rewrite) {
    for (let index = 0; index < limit; index += 1) {
      if ((await sample(base, urlPath, firstIndex + index, rewrite)) !== 'validation')
        return 'inconclusive';
    }
    const final = await sample(base, urlPath, firstIndex + limit, rewrite);
    return final === 'validation' ? 'no_app_limit' : final;
  }

  // Different groups keep the two paths within the global 60/min and each WAF 60/min.
  const apiDirect = await group(api, '/api/v1/locations?query=a', 30, 0, false);
  if (apiDirect !== 'rate_limited') return { ok: false, apiDirect, webRewrite: 'not_run' };
  const webRewrite = await group(web, '/api/v1/forecast?latitude=invalid', 15, 31, true);
  return { ok: webRewrite === 'rate_limited', apiDirect, webRewrite };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const summary = await runIdentityProbe(process.env);
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    if (!summary.ok) process.exitCode = 1;
  } catch {
    process.stderr.write('Identity probe interrupted without exposing operational values.\n');
    process.exitCode = 1;
  }
}
