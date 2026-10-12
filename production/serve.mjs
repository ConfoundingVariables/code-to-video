import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const MIME_TYPES = new Map([
  ['.avif', 'image/avif'],
  ['.css', 'text/css; charset=utf-8'],
  ['.eot', 'application/vnd.ms-fontobject'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.m4a', 'audio/mp4'],
  ['.mp3', 'audio/mpeg'],
  ['.mp4', 'video/mp4'],
  ['.ogg', 'audio/ogg'],
  ['.otf', 'font/otf'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.ttf', 'font/ttf'],
  ['.wasm', 'application/wasm'],
  ['.wav', 'audio/wav'],
  ['.webm', 'video/webm'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

const DEFAULT_PORT = 4173;

function safePath(root, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!decoded || decoded.includes('\0') || decoded.includes('\\')) return null;

  const rootPath = path.resolve(root);
  const requested = path.resolve(rootPath, `.${decoded}`);
  if (requested !== rootPath && !requested.startsWith(`${rootPath}${path.sep}`)) return null;
  return requested;
}

function sendText(response, status, body) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}

export function createStaticServer({ root = process.cwd() } = {}) {
  const rootPath = path.resolve(root);
  return createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      sendText(response, 405, 'Method Not Allowed\n');
      return;
    }

    let url;
    try {
      url = new URL(request.url ?? '/', 'http://127.0.0.1');
    } catch {
      sendText(response, 400, 'Bad Request\n');
      return;
    }

    // The root document is intentionally explicit: assets remain relative to the project root.
    const pathname = url.pathname === '/' ? '/film.html' : url.pathname;
    const filename = safePath(rootPath, pathname);
    if (!filename) {
      sendText(response, 400, 'Bad Request\n');
      return;
    }

    let stat;
    try {
      stat = await fs.stat(filename);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
        sendText(response, 404, 'Not Found\n');
      } else {
        sendText(response, 500, 'Internal Server Error\n');
      }
      return;
    }
    if (!stat.isFile()) {
      sendText(response, 404, 'Not Found\n');
      return;
    }

    const extension = path.extname(filename).toLowerCase();
    const contentType = MIME_TYPES.get(extension) ?? 'application/octet-stream';
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Length': stat.size,
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    let body;
    try {
      body = await fs.readFile(filename);
    } catch {
      if (!response.headersSent) sendText(response, 500, 'Internal Server Error\n');
      else response.destroy();
      return;
    }
    response.end(body);
  });
}

export async function startServer({ root = process.cwd(), port = DEFAULT_PORT } = {}) {
  const server = createStaticServer({ root });
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen({ host: '127.0.0.1', port });
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  return {
    server,
    port: actualPort,
    url: `http://127.0.0.1:${actualPort}/`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

function parsePort(value) {
  if (value === undefined) return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const portIndex = args.indexOf('--port');
  let port;
  try {
    port = parsePort(portIndex === -1 ? undefined : args[portIndex + 1]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
  if (process.exitCode !== 2) {
    const rootIndex = args.indexOf('--root');
    const root = rootIndex === -1 ? process.cwd() : path.resolve(args[rootIndex + 1] ?? process.cwd());
    const running = await startServer({ root, port });
    console.log(`Serving ${root} at ${running.url}`);
    const shutdown = async () => {
      try {
        await running.close();
      } finally {
        process.exit(0);
      }
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }
}
