import type { ProjectStore } from './store';
import type { BookDesign, StoryState } from './types';

/**
 * The codex is a view over the book's own memory, not a second copy of it.
 *
 * Everything here is read from, and written back into, the artifacts the pipeline already
 * owns: character cards and world rules live in the design, what happened and who knows what
 * live in StoryState, and locations are wherever the plans put the scenes. A codex that kept
 * its own characters beside the design's would be two memories disagreeing — and the one the
 * writer reads would be whichever the last call happened to pass.
 */
export interface CodexCharacter {
  /** The design's own id (C01…), which state conditions and scene plans refer to. */
  id: string;
  name: string;
  storyFunction: string;
  goal: string;
  behavior: string;
  /** The character's voice: how they speak and what they notice. Fed to the writer per scene. */
  voice: string;
  motives: string[];
  capabilities: string[];
  limitations: string[];
  relationships: string[];
  /** Folded from finished scenes, not from the plan: what this character actually knows now. */
  knowledge: string[];
  beliefs: string[];
  /** Current directed state, e.g. C01->C02.trust — the relationship as the book last left it. */
  conditions: { key: string; value: string }[];
}

export interface CodexWorldRule {
  id: string;
  rule: string;
  consequences: string[];
}

export interface CodexEvent {
  id: string;
  description: string;
  participants: string[];
  evidenceRefs: string[];
}

export interface CodexFact {
  id: string;
  statement: string;
  evidenceRefs: string[];
}

/** Locations are not a stored artifact: they are where the planned scenes happen. */
export interface CodexLocation {
  name: string;
  scenes: string[];
}

export interface CodexView {
  characters: CodexCharacter[];
  worldRules: CodexWorldRule[];
  events: CodexEvent[];
  facts: CodexFact[];
  locations: CodexLocation[];
}

function conditionsFor(state: StoryState, characterId: string): { key: string; value: string }[] {
  return Object.entries(state.conditions || {})
    .filter(([key]) => key.startsWith(`${characterId}.`) || key.startsWith(`${characterId}->`))
    .map(([key, value]) => ({ key, value }));
}

function locationsFrom(store: ProjectStore, design: BookDesign | null): CodexLocation[] {
  const byName = new Map<string, string[]>();
  const chapters = design?.chapter_map.length ?? 0;
  for (let chapter = 1; chapter <= chapters; chapter++) {
    for (const scene of store.loadChapterPlan(chapter)?.scenes ?? []) {
      const name = scene.location?.trim();
      if (!name) continue;
      byName.set(name, [...(byName.get(name) ?? []), scene.id]);
    }
  }
  return [...byName.entries()].map(([name, scenes]) => ({ name, scenes }));
}

export function readCodex(store: ProjectStore): CodexView {
  const design = store.loadDesign();
  const state = store.loadState();
  return {
    characters: (design?.characters ?? []).map(card => ({
      id: card.id,
      name: card.name,
      storyFunction: card.story_function ?? '',
      goal: card.goal ?? '',
      behavior: card.behavior ?? '',
      voice: card.voice_and_perception ?? '',
      motives: card.motives ?? [],
      capabilities: card.capabilities ?? [],
      limitations: card.limitations ?? [],
      relationships: card.relationships ?? [],
      knowledge: state.knowledge?.[card.id] ?? [],
      beliefs: state.beliefs?.[card.id] ?? [],
      conditions: conditionsFor(state, card.id),
    })),
    worldRules: (design?.world_rules ?? []).map(rule => ({
      id: rule.id,
      rule: rule.rule,
      consequences: rule.relevant_consequences ?? [],
    })),
    events: (state.events ?? []).map(event => ({
      id: event.id,
      description: event.description,
      participants: event.participants ?? [],
      evidenceRefs: event.evidence_refs ?? [],
    })),
    facts: (state.facts ?? []).map(fact => ({
      id: fact.id,
      statement: fact.statement,
      evidenceRefs: fact.evidence_refs ?? [],
    })),
    locations: locationsFrom(store, design),
  };
}

/** What the author may change by hand. Each lands in the artifact that already owns it. */
export type CodexEdit =
  | { kind: 'character'; id: string; patch: Partial<Pick<CodexCharacter, 'name' | 'storyFunction' | 'goal' | 'behavior' | 'voice' | 'motives' | 'capabilities' | 'limitations' | 'relationships'>> }
  | { kind: 'characterKnowledge'; id: string; knowledge?: string[]; beliefs?: string[] }
  | { kind: 'condition'; key: string; value: string }
  | { kind: 'worldRule'; id: string; rule?: string; consequences?: string[] }
  | { kind: 'addWorldRule'; rule: string }
  | { kind: 'fact'; id: string; statement: string }
  | { kind: 'addFact'; statement: string }
  | { kind: 'event'; id: string; description: string };

function nextId(prefix: string, taken: Set<string>): string {
  for (let n = 1; ; n++) {
    const id = `${prefix}${String(n).padStart(2, '0')}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * Applies an author's edit to the live memory. Facts and events the author writes carry the
 * evidence ref 'author' rather than a paragraph id: the pipeline's own records cite the prose
 * that proves them, and a hand-written one should not pretend a scene said it.
 */
export function applyCodexEdit(store: ProjectStore, edit: CodexEdit): void {
  const design = store.loadDesign();
  const state = store.loadState();

  switch (edit.kind) {
    case 'character': {
      if (!design) return;
      const characters = design.characters.map(card => card.id === edit.id ? {
        ...card,
        ...(edit.patch.name !== undefined ? { name: edit.patch.name } : {}),
        ...(edit.patch.storyFunction !== undefined ? { story_function: edit.patch.storyFunction } : {}),
        ...(edit.patch.goal !== undefined ? { goal: edit.patch.goal } : {}),
        ...(edit.patch.behavior !== undefined ? { behavior: edit.patch.behavior } : {}),
        ...(edit.patch.voice !== undefined ? { voice_and_perception: edit.patch.voice } : {}),
        ...(edit.patch.motives !== undefined ? { motives: edit.patch.motives } : {}),
        ...(edit.patch.capabilities !== undefined ? { capabilities: edit.patch.capabilities } : {}),
        ...(edit.patch.limitations !== undefined ? { limitations: edit.patch.limitations } : {}),
        ...(edit.patch.relationships !== undefined ? { relationships: edit.patch.relationships } : {}),
      } : card);
      store.saveDesign({ ...design, characters });
      return;
    }
    case 'characterKnowledge': {
      store.saveState({
        ...state,
        knowledge: edit.knowledge ? { ...state.knowledge, [edit.id]: edit.knowledge } : state.knowledge,
        beliefs: edit.beliefs ? { ...state.beliefs, [edit.id]: edit.beliefs } : state.beliefs,
      });
      return;
    }
    case 'condition': {
      store.saveState({ ...state, conditions: { ...state.conditions, [edit.key]: edit.value } });
      return;
    }
    case 'worldRule': {
      if (!design) return;
      const world_rules = design.world_rules.map(rule => rule.id === edit.id ? {
        ...rule,
        ...(edit.rule !== undefined ? { rule: edit.rule } : {}),
        ...(edit.consequences !== undefined ? { relevant_consequences: edit.consequences } : {}),
      } : rule);
      store.saveDesign({ ...design, world_rules });
      return;
    }
    case 'addWorldRule': {
      if (!design) return;
      const id = nextId('W', new Set(design.world_rules.map(rule => rule.id)));
      store.saveDesign({
        ...design,
        world_rules: [...design.world_rules, { id, rule: edit.rule, relevant_consequences: [] }],
      });
      return;
    }
    case 'fact': {
      store.saveState({
        ...state,
        facts: state.facts.map(fact => fact.id === edit.id ? { ...fact, statement: edit.statement } : fact),
      });
      return;
    }
    case 'addFact': {
      const id = nextId('F', new Set(state.facts.map(fact => fact.id)));
      store.saveState({
        ...state,
        facts: [...state.facts, { id, statement: edit.statement, evidence_refs: ['author'] }],
      });
      return;
    }
    case 'event': {
      store.saveState({
        ...state,
        events: state.events.map(event => event.id === edit.id ? { ...event, description: edit.description } : event),
      });
      return;
    }
  }
}

/** The codex as plain text, for embedding into the RAG index and for prompts. */
export function codexEntries(view: CodexView): { ref: string; kind: string; text: string }[] {
  const entries: { ref: string; kind: string; text: string }[] = [];
  for (const character of view.characters) {
    entries.push({
      ref: character.id,
      kind: 'character',
      text: [
        `${character.name} (${character.storyFunction})`,
        character.goal && `Goal: ${character.goal}`,
        character.behavior && `Behaviour: ${character.behavior}`,
        character.voice && `Voice: ${character.voice}`,
        character.motives.length && `Motives: ${character.motives.join('; ')}`,
        character.limitations.length && `Limits: ${character.limitations.join('; ')}`,
        character.knowledge.length && `Knows: ${character.knowledge.join('; ')}`,
        character.beliefs.length && `Believes: ${character.beliefs.join('; ')}`,
        character.conditions.length && `Now: ${character.conditions.map(c => `${c.key}=${c.value}`).join('; ')}`,
      ].filter(Boolean).join('. '),
    });
  }
  for (const rule of view.worldRules) {
    entries.push({ ref: rule.id, kind: 'worldRule', text: [rule.rule, ...rule.consequences].join('. ') });
  }
  for (const event of view.events) {
    entries.push({ ref: event.id, kind: 'event', text: `${event.description}${event.participants.length ? ` (${event.participants.join(', ')})` : ''}` });
  }
  for (const fact of view.facts) {
    entries.push({ ref: fact.id, kind: 'fact', text: fact.statement });
  }
  for (const location of view.locations) {
    entries.push({ ref: `LOC:${location.name}`, kind: 'location', text: `${location.name} — scenes: ${location.scenes.join(', ')}` });
  }
  return entries.filter(entry => entry.text.trim());
}
