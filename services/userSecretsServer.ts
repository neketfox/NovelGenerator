// Vite dev-server middleware for the Gemini key pool: data/user/secrets.json. This is a local
// pet project run only via `npm run dev` on the owner's own machine, so the key pool lives on
// disk next to everything else rather than in the browser — same reasoning and same shape as
// userPreferencesServer.ts, kept as a separate file/endpoint since a key is a different kind
// of thing than a UI preference.
import type { Plugin } from 'vite';
import * as fs from 'fs';
import * as path from 'path';

const SECRETS_FILE = path.resolve(process.cwd(), 'data', 'user', 'secrets.json');

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

export function userSecretsServerPlugin(): Plugin {
  return {
    name: 'user-secrets-server',
    configureServer(server) {
      server.middlewares.use('/api/secrets', async (req, res) => {
        try {
          if (req.method === 'GET') {
            return sendJson(res, 200, readJson(SECRETS_FILE) ?? { keys: [], activeKeyId: null });
          }
          if (req.method === 'PUT') {
            const body = JSON.parse(await readBody(req));
            fs.mkdirSync(path.dirname(SECRETS_FILE), { recursive: true });
            fs.writeFileSync(SECRETS_FILE, JSON.stringify(body, null, 2), 'utf-8');
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
