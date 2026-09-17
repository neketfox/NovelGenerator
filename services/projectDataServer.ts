// Vite dev-server middleware that persists studio projects as plain files on disk under
// data/<projectId>/ — the durable, browser-independent source of truth whenever the app runs
// via `npm run dev` (which is how the desktop launcher starts it). Only runs in dev; the
// production static build (served via `npx serve -s dist`) has no Node process behind it, so
// the client falls back to localStorage/IndexedDB there (see studioStore.ts, lib/rag/vectorStore.ts).
//
// Layout, chosen so an edit never re-serializes the whole book:
//   data/<id>/project.json           - metadata, codex, and chapter headers (no prose)
//   data/<id>/chapters/<chapterId>.json - one chapter's sections (the actual manuscript)
//   data/<id>/rag/<refId>.json       - one section/codex entry's AI-memory vectors
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
function metaFile(id: string): string {
  return path.join(projectDir(id), 'project.json');
}
function chapterFile(id: string, chapterId: string): string {
  return path.join(projectDir(id), 'chapters', `${safe(chapterId)}.json`);
}
function ragDir(id: string): string {
  return path.join(projectDir(id), 'rag');
}
function ragFile(id: string, refId: string): string {
  return path.join(ragDir(id), `${safe(refId)}.json`);
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

/** Assembles the full project (metadata + every chapter's sections) for the editor. */
function loadFullProject(id: string): Record<string, unknown> | null {
  const meta = readJson(metaFile(id)) as { chapters?: { id: string }[] } | null;
  if (!meta) return null;
  const chapters = (meta.chapters ?? []).map((header) => ({
    ...header,
    sections: (readJson(chapterFile(id, header.id)) as { sections?: unknown[] })?.sections ?? [],
  }));
  return { ...meta, chapters };
}

/** Metadata-only view (chapter headers, no prose) — fast to list and to save on a title/codex edit. */
function loadMetaProject(id: string): Record<string, unknown> | null {
  return readJson(metaFile(id)) as Record<string, unknown> | null;
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
      server.middlewares.use('/api/projects', async (req, res) => {
        try {
          fs.mkdirSync(DATA_DIR, { recursive: true });
          const url = new URL(req.url ?? '/', 'http://localhost');
          const segments = url.pathname.split('/').filter(Boolean);
          const [id, section, refId] = segments; // '', or [id], or [id,'chapters',chapterId], or [id,'rag',refId]

          // --- project list / metadata ---
          if (req.method === 'GET' && !id) {
            const dirs = fs.existsSync(DATA_DIR)
              ? fs.readdirSync(DATA_DIR, { withFileTypes: true }).filter((d) => d.isDirectory())
              : [];
            const projects = dirs.map((d) => loadMetaProject(d.name)).filter(Boolean);
            return sendJson(res, 200, { projects });
          }

          if (req.method === 'GET' && id && !section) {
            const project = loadFullProject(id);
            if (!project) return sendJson(res, 404, { error: 'not found' });
            return sendJson(res, 200, project);
          }

          if (req.method === 'PUT' && id && !section) {
            const body = JSON.parse(await readBody(req));
            // Only the metadata shape is durable here; a caller that sends full sections is
            // still safe because chapter files are never read from this payload.
            const { chapters, ...rest } = body;
            const chapterHeaders = Array.isArray(chapters)
              ? chapters.map(({ sections: _sections, ...header }: Record<string, unknown>) => header)
              : [];
            writeJson(metaFile(id), { ...rest, chapters: chapterHeaders });
            return sendJson(res, 200, { ok: true });
          }

          if (req.method === 'DELETE' && id && !section) {
            const dir = projectDir(id);
            if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
            return sendJson(res, 200, { ok: true });
          }

          // --- chapter manuscript (fast, point-update save target) ---
          if (id && section === 'chapters' && refId) {
            if (req.method === 'PUT') {
              const body = JSON.parse(await readBody(req));
              writeJson(chapterFile(id, refId), { sections: body.sections ?? [] });
              return sendJson(res, 200, { ok: true });
            }
            if (req.method === 'GET') {
              return sendJson(res, 200, readJson(chapterFile(id, refId)) ?? { sections: [] });
            }
          }

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
