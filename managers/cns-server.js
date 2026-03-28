/**
 * WinCC OA CNS HTTP Server Manager
 *
 * Runs as a WinCC OA "node" manager.  Exposes a lightweight HTTP server that
 * gives the vscode-winccoa-cns VS Code extension direct access to CNS data —
 * without requiring the winccoa-mcp-server extension.
 *
 * Endpoints:
 *   GET  /health          → { status: "ok", version: string }
 *   POST /cns/views       → { views: string[] }
 *   POST /cns/trees       → body: { viewPath } → { viewPath, trees: CnsNodeInfo[] }
 *   POST /cns/children    → body: { nodePath } → { nodePath, children: CnsNodeInfo[] }
 *   GET  /cns/events      → SSE stream; fires on every CNS change
 *
 * Auth: Bearer token (CNS_SERVER_TOKEN in .env).
 * Config: .env file in the same directory as this script.
 *
 * @see https://www.winccoa.com/documentation/WinCCOA/latest/en_US/apis/winccoa-manager/
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Config — load from .env next to this script
// ---------------------------------------------------------------------------

/** Parse a minimal .env file: lines of KEY=VALUE, ignore # comments. */
function loadEnv(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (key && !(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env is optional — continue with env vars already set
  }
}

loadEnv(path.join(__dirname, '.env'));

const PORT = parseInt(process.env.CNS_SERVER_PORT ?? '4712', 10);
const TOKEN = process.env.CNS_SERVER_TOKEN ?? '';
const VERSION = '1.0.0';

if (!TOKEN) {
  console.error('[cns-server] WARNING: CNS_SERVER_TOKEN is not set. All requests will be rejected.');
}

// ---------------------------------------------------------------------------
// WinCC OA manager initialisation
// ---------------------------------------------------------------------------

/** @type {import('../src/types/winccoa-manager').WinccoaManager} */
let winccoa;
try {
  const { WinccoaManager } = require('winccoa-manager');
  winccoa = new WinccoaManager();
} catch (err) {
  console.error('[cns-server] Failed to initialise WinccoaManager:', err.message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// CnsNodeInfo builder (mirrors src/types.ts)
// ---------------------------------------------------------------------------

/**
 * Convert a WinccoaCnsTreeNode to a plain CnsNodeInfo object.
 * @param {import('../src/types/winccoa-manager').WinccoaCnsTreeNode} node
 * @returns {object}
 */
function toCnsNodeInfo(node) {
  const langs = winccoa.getProjectLangs();
  const displayNames = node.displayNames ?? {};

  let displayName = '';
  for (const lang of langs) {
    if (displayNames[lang]) {
      displayName = displayNames[lang];
      break;
    }
  }
  if (!displayName) {
    const first = Object.values(displayNames)[0];
    displayName = first ?? node.path.split('.').pop() ?? node.path;
  }

  return {
    path: node.path,
    displayName,
    displayNames,
    linkedDp: node.linkedDp ?? '',
    isTree: node.isTree ?? false,
    isLeaf: node.isLeaf ?? false,
    ...(node.icon !== undefined ? { icon: node.icon } : {}),
  };
}

// ---------------------------------------------------------------------------
// SSE client registry
// ---------------------------------------------------------------------------

/** @type {Set<import('node:http').ServerResponse>} */
const sseClients = new Set();

/** Push a CNS change event to all connected SSE clients. */
function pushCnsChange(changedPath) {
  const payload = JSON.stringify({
    method: 'notifications/resources/updated',
    params: { uri: changedPath ? `cns://${changedPath}` : 'cns://' },
  });
  const data = `data: ${payload}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(data);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Subscribe to all CNS changes once.
try {
  winccoa.cnsConnect('', (_action, node) => {
    pushCnsChange(node?.path ?? '');
  });
} catch (err) {
  console.error('[cns-server] cnsConnect failed (CNS may not be available yet):', err.message);
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/**
 * Check Authorization header; returns true if valid.
 * @param {import('node:http').IncomingMessage} req
 */
function isAuthorised(req) {
  if (!TOKEN) return false;
  const auth = req.headers['authorization'] ?? '';
  return auth === `Bearer ${TOKEN}`;
}

/**
 * Read and parse the JSON request body.
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<object>}
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send a JSON response.
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {object} body
 */
function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/** GET /health */
function handleHealth(res) {
  json(res, 200, { status: 'ok', version: VERSION });
}

/** POST /cns/views */
async function handleGetViews(res, body) {
  const views = await winccoa.cnsGetViews(body.system);
  json(res, 200, { views });
}

/** POST /cns/trees */
async function handleGetTrees(res, body) {
  const { viewPath } = body;
  if (!viewPath) { json(res, 400, { error: 'viewPath is required' }); return; }
  const trees = await winccoa.cnsGetTrees(viewPath);
  json(res, 200, { viewPath, trees: trees.map(toCnsNodeInfo) });
}

/** POST /cns/children */
async function handleGetChildren(res, body) {
  const { nodePath } = body;
  if (!nodePath) { json(res, 400, { error: 'nodePath is required' }); return; }
  const children = await winccoa.cnsGetChildren(nodePath);
  json(res, 200, { nodePath, children: children.map(toCnsNodeInfo) });
}

/** GET /cns/events — SSE stream */
function handleEvents(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write(': connected\n\n');

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  // CORS pre-flight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    });
    res.end();
    return;
  }

  // Auth check (skip for health endpoint)
  const isHealth = req.method === 'GET' && req.url === '/health';
  if (!isHealth && !isAuthorised(req)) {
    json(res, 401, { error: 'Unauthorised' });
    return;
  }

  try {
    if (req.method === 'GET' && req.url === '/health') {
      handleHealth(res);
      return;
    }

    if (req.method === 'GET' && req.url === '/cns/events') {
      handleEvents(req, res);
      return;
    }

    if (req.method === 'POST' && req.url === '/cns/views') {
      const body = await readBody(req);
      await handleGetViews(res, body);
      return;
    }

    if (req.method === 'POST' && req.url === '/cns/trees') {
      const body = await readBody(req);
      await handleGetTrees(res, body);
      return;
    }

    if (req.method === 'POST' && req.url === '/cns/children') {
      const body = await readBody(req);
      await handleGetChildren(res, body);
      return;
    }

    json(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('[cns-server] Error handling request:', err.message);
    json(res, 500, { error: err.message ?? 'Internal server error' });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[cns-server] Listening on http://127.0.0.1:${PORT}`);
});

server.on('error', err => {
  console.error('[cns-server] Server error:', err.message);
});
