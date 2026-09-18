// Vite dev-server middleware that persists studio projects as plain files on disk under
// data/<projectId>/ — the durable, browser-independent source of truth whenever the app runs
// via `npm run dev` (which is how the desktop launcher starts it). Only runs in dev; the
// production static build (served via `npx serve -s dist`) has no Node process behind it, so
// the app expects to be run from the desktop launcher, which starts the dev server.
//
// Layout — one book is one slot, in the generator's own artifact format:
//   data/<id>/snapshot.json    - the whole project (input, design, scenes, memory, manuscript)
//   data/<id>/rag/<refId>.json - the semantic index over that same memory
import type { Plugin } from 'vite';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');

function safe(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '');
}
function projectDir(id: string): string {
  return path.join(DATA_DIR, safe(id));
}
function ragDir(id: string): string {
  return path.join(projectDir(id), 'rag');
}
function ragFile(id: string, refId: string): string {
  return path.join(ragDir(id), `${safe(refId)}.json`);
}
/**
 * The generator's own project snapshot (utils/novel/v2/export.ts) — the format the box
 * already uses for export/import and for resuming an unfinished book. Storing it per project
 * here is what makes a book survive a browser restart without any browser storage at all.
 */
function snapshotFile(id: string): string {
  return path.join(projectDir(id), 'snapshot.json');
}

/** The card the dashboard shows, derived server-side so listing never ships whole manuscripts. */
function slotSummary(id: string): Record<string, unknown> | null {
  const snapshot = readJson(snapshotFile(id)) as
    | { exportedAt?: string; files?: { input?: { premise?: string; chapter_count?: number; genre?: string }; book_design?: { contract?: { working_title?: string } }; manuscript?: { chapter: number }[] } }
    | null;
  if (!snapshot?.files) return null;
  const { input, book_design: design, manuscript } = snapshot.files;
  const written = Array.isArray(manuscript) ? manuscript.length : 0;
  const total = input?.chapter_count ?? 0;
  return {
    id,
    title: design?.contract?.working_title || input?.premise?.slice(0, 60) || id,
    premise: input?.premise ?? '',
    genre: input?.genre ?? '',
    chaptersWritten: written,
    chapterCount: total,
    /** Started but not finished — the "unfinished book" card the dashboard offers to continue. */
    unfinished: total > 0 && written > 0 && written < total,
    updatedAt: snapshot.exportedAt ?? null,
  };
}

function readJson(file: string): unknown {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}
function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf-8');
}

function readBody(req: import('http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJson(res: import('http').ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

export function projectDataServerPlugin(): Plugin {
  return {
    name: 'project-data-server',
    configureServer(server) {
      // The generator's own project slots: data/<id>/snapshot.json, in the box's existing
      // snapshot format, so a book resumes from disk instead of from browser storage.
      server.middlewares.use('/api/slots', async (req, res) => {
        try {
          fs.mkdirSync(DATA_DIR, { recursive: true });
          const url = new URL(req.url ?? '/', 'http://localhost');
          const [id] = url.pathname.split('/').filter(Boolean);

          if (req.method === 'GET' && !id) {
            const dirs = fs.existsSync(DATA_DIR)
              ? fs.readdirSync(DATA_DIR, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== 'user')
              : [];
            const slots = dirs.map((d) => slotSummary(d.name)).filter(Boolean);
            return sendJson(res, 200, { slots });
          }
          if (req.method === 'GET' && id) {
            const snapshot = readJson(snapshotFile(id));
            if (!snapshot) return sendJson(res, 404, { error: 'not found' });
            return sendJson(res, 200, snapshot);
          }
          if (req.method === 'PUT' && id) {
            writeJson(snapshotFile(id), JSON.parse(await readBody(req)));
            return sendJson(res, 200, { ok: true });
          }
          if (req.method === 'DELETE' && id) {
            const dir = projectDir(id);
            if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
            return sendJson(res, 200, { ok: true });
          }
          sendJson(res, 404, { error: 'unsupported route' });
        } catch (err) {
          sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
      });

      server.middlewares.use('/api/projects', async (req, res) => {
        try {
          fs.mkdirSync(DATA_DIR, { recursive: true });
          const url = new URL(req.url ?? '/', 'http://localhost');
          const segments = url.pathname.split('/').filter(Boolean);
          const [id, section, refId] = segments; // [id,'rag'] or [id,'rag',refId]

          // --- RAG memory, one file per section/codex entry ---
          if (id && section === 'rag' && !refId) {
            if (req.method === 'GET') {
              const dir = ragDir(id);
              const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
              const records = files.flatMap((f) => (readJson(path.join(dir, f)) as unknown[]) ?? []);
              return sendJson(res, 200, { records });
            }
            if (req.method === 'DELETE') {
              if (fs.existsSync(ragDir(id))) fs.rmSync(ragDir(id), { recursive: true, force: true });
              return sendJson(res, 200, { ok: true });
            }
          }

          if (id && section === 'rag' && refId) {
            if (req.method === 'PUT') {
              const body = JSON.parse(await readBody(req));
              const records = Array.isArray(body.records) ? body.records : [];
              if (records.length === 0) {
                const file = ragFile(id, refId);
                if (fs.existsSync(file)) fs.rmSync(file);
              } else {
                writeJson(ragFile(id, refId), records);
              }
              return sendJson(res, 200, { ok: true });
            }
            if (req.method === 'DELETE') {
              const file = ragFile(id, refId);
              if (fs.existsSync(file)) fs.rmSync(file);
              return sendJson(res, 200, { ok: true });
            }
          }

          sendJson(res, 404, { error: 'unsupported route' });
        } catch (err) {
          sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
      });
    },
  };
}
