// Vite dev-server middleware for the user's UI preset (language, theme): a single file at
// data/user/preferences.json, not browser storage — so it survives a reboot the same way
// project data does, independent of which browser opens the app. Dev-only, like
// projectDataServer.ts; the client falls back to localStorage when there is no Node process.
import type { Plugin } from 'vite';
import * as fs from 'fs';
import * as path from 'path';

const PREFS_FILE = path.resolve(process.cwd(), 'data', 'user', 'preferences.json');

function readJson(file: string): unknown {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

function sendJson(res: import('http').ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function readBody(req: import('http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

export function userPreferencesServerPlugin(): Plugin {
  return {
    name: 'user-preferences-server',
    configureServer(server) {
      server.middlewares.use('/api/preferences', async (req, res) => {
        try {
          if (req.method === 'GET') {
            return sendJson(res, 200, readJson(PREFS_FILE) ?? {});
          }
          if (req.method === 'PUT') {
            const patch = JSON.parse(await readBody(req));
            const current = (readJson(PREFS_FILE) as Record<string, unknown>) ?? {};
            fs.mkdirSync(path.dirname(PREFS_FILE), { recursive: true });
            fs.writeFileSync(PREFS_FILE, JSON.stringify({ ...current, ...patch }, null, 2), 'utf-8');
            return sendJson(res, 200, { ok: true });
          }
          sendJson(res, 404, { error: 'unsupported route' });
        } catch (err) {
          sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
      });
    },
  };
}
