import http from 'node:http';

const targetOrigin = process.env.SPARK_ABORT_PROXY_TARGET;
const port = Number(process.env.SPARK_ABORT_PROXY_PORT ?? 8788);
const delayMs = Number(process.env.SPARK_ABORT_DELAY_MS ?? 1500);
const delayPath = process.env.SPARK_ABORT_DELAY_PATH ?? '/api/dashboard';

if (!targetOrigin || !Number.isSafeInteger(port) || port <= 0 || !Number.isFinite(delayMs) || delayMs < 0) {
  throw new Error('SPARK_ABORT_PROXY_TARGET, SPARK_ABORT_PROXY_PORT, and SPARK_ABORT_DELAY_MS must be valid');
}

let delayedResponseUsed = false;

function waitWithAbort(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('proxy response aborted', 'AbortError'));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function requestHeaders(request) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || ['connection', 'content-length', 'host', 'transfer-encoding'].includes(name)) continue;
    headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  return headers;
}

const server = http.createServer(async (request, response) => {
  const controller = new AbortController();
  let responseFinished = false;
  response.on('close', () => {
    if (!responseFinished) controller.abort();
  });

  try {
    const bodyChunks = [];
    for await (const chunk of request) bodyChunks.push(chunk);
    const url = new URL(request.url ?? '/', targetOrigin);
    const method = request.method ?? 'GET';
    const upstream = await fetch(url, {
      method,
      headers: requestHeaders(request),
      ...(method === 'GET' || method === 'HEAD' ? {} : { body: Buffer.concat(bodyChunks) }),
      signal: controller.signal,
    });

    if (url.pathname === delayPath && !delayedResponseUsed) {
      delayedResponseUsed = true;
      console.log(`[delayed-worker-proxy] delaying ${delayPath} for ${delayMs}ms`);
      await waitWithAbort(delayMs, controller.signal);
    }

    const responseBody = Buffer.from(await upstream.arrayBuffer());
    if (controller.signal.aborted) return;
    const headers = {};
    for (const [name, value] of upstream.headers) {
      // Node's fetch transparently decompresses upstream content. Do not forward
      // the upstream encoding marker with the decompressed bytes.
      if (!['connection', 'content-encoding', 'content-length', 'transfer-encoding'].includes(name)) headers[name] = value;
    }
    response.writeHead(upstream.status, headers);
    response.end(responseBody, () => {
      responseFinished = true;
    });
  } catch (error) {
    if (controller.signal.aborted) return;
    responseFinished = true;
    response.writeHead(502, { 'content-type': 'text/plain' });
    response.end(`proxy error: ${error instanceof Error ? error.message : String(error)}`);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[delayed-worker-proxy] ready http://127.0.0.1:${port} -> ${targetOrigin}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
