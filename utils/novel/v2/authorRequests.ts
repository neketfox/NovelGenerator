import { applyCodexEdit, type CodexEdit } from './codex';
import type { ProjectStore } from './store';

/**
 * What the author asks for mid-run, queued and applied through the mechanisms the pipeline
 * already honours — never through a second path of its own.
 *
 * - a note for the writer becomes an explicit requirement on the design's contract, which is
 *   exactly how an unresolved review objection already travels into every later chapter;
 * - a memory correction is a codex edit, and the codex is the design and StoryState;
 * - a rewrite or a continuation is a standing instruction on the chapter it names, which the
 *   planner reads as a finding before it plans and the writer reads as a requirement.
 *
 * Queued rather than immediate because a run is in flight: an edit applied in the middle of a
 * scene would change the memory the scene was already written against.
 */
export type AuthorRequestKind = 'note' | 'memory' | 'chapter';

export interface AuthorRequest {
  id: string;
  kind: AuthorRequestKind;
  /** What the author wrote, kept verbatim so the record shows the ask, not the paraphrase. */
  text: string;
  /** For 'chapter' requests: which chapter the instruction belongs to. */
  chapter?: number;
  /** For 'memory' requests: the structured edit this resolves to. */
  edit?: CodexEdit;
  createdAt: string;
  appliedAt?: string;
  /** Why it could not be applied, when it could not. */
  refusedReason?: string;
}

const QUEUE_KEY = 'author_requests';

/**
 * The queue lives in the run log's own store through a checkpoint-style record, so it travels
 * with the project snapshot and survives a reload like everything else in the slot.
 */
export function readRequests(store: ProjectStore): AuthorRequest[] {
  const line = store.runLog().filter(entry => entry.stage === QUEUE_KEY).at(-1);
  if (!line) return [];
  try {
    const parsed = JSON.parse(line.detail);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRequests(store: ProjectStore, requests: AuthorRequest[]): void {
  store.log(QUEUE_KEY, JSON.stringify(requests));
}

export function queueRequest(store: ProjectStore, request: Omit<AuthorRequest, 'id' | 'createdAt'>): AuthorRequest {
  const queued: AuthorRequest = {
    ...request,
    id: `AR${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    createdAt: new Date().toISOString(),
  };
  writeRequests(store, [...readRequests(store), queued]);
  return queued;
}

export function pendingRequests(store: ProjectStore): AuthorRequest[] {
  return readRequests(store).filter(request => !request.appliedAt && !request.refusedReason);
}

/** A standing instruction for a chapter, phrased so the planner and the writer both read it. */
function chapterRequirement(request: AuthorRequest): string {
  return `Author request for chapter ${request.chapter}: ${request.text}`;
}

/**
 * Applies everything queued, and says what it did. Safe to call between chapters: each kind
 * lands in the artifact that already carries that kind of instruction, and a request that
 * cannot be applied is marked refused rather than dropped or retried forever.
 */
export function applyPendingRequests(store: ProjectStore): { applied: AuthorRequest[]; refused: AuthorRequest[] } {
  const all = readRequests(store);
  const applied: AuthorRequest[] = [];
  const refused: AuthorRequest[] = [];
  const now = new Date().toISOString();

  const next = all.map(request => {
    if (request.appliedAt || request.refusedReason) return request;

    if (request.kind === 'memory') {
      if (!request.edit) {
        const marked = { ...request, refusedReason: 'No structured memory edit was resolved for this request.' };
        refused.push(marked);
        return marked;
      }
      applyCodexEdit(store, request.edit);
      const marked = { ...request, appliedAt: now };
      applied.push(marked);
      return marked;
    }

    const design = store.loadDesign();
    if (!design) {
      const marked = { ...request, refusedReason: 'The book has no design yet: there is nothing for the instruction to attach to.' };
      refused.push(marked);
      return marked;
    }
    const requirement = request.kind === 'chapter' && request.chapter
      ? chapterRequirement(request)
      : `Author request: ${request.text}`;
    store.saveDesign({
      ...design,
      contract: {
        ...design.contract,
        explicit_requirements: [
          ...(Array.isArray(design.contract.explicit_requirements) ? design.contract.explicit_requirements : []),
          requirement,
        ],
      },
    });
    const marked = { ...request, appliedAt: now };
    applied.push(marked);
    return marked;
  });

  if (applied.length || refused.length) writeRequests(store, next);
  return { applied, refused };
}
