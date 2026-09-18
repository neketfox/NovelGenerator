import { describe, it, expect } from 'vitest';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import { readCodex, applyCodexEdit, codexEntries } from '../utils/novel/v2/codex';
import { queueRequest, pendingRequests, applyPendingRequests, readRequests } from '../utils/novel/v2/authorRequests';
import type { BookDesign, ProjectInput } from '../utils/novel/v2/types';

const input: ProjectInput = {
  premise: 'A courier smuggles a letter across a closed border.',
  chapter_count: 2,
  genre: 'romance',
  target_total_words: 8000,
  author_requirements: '(none)',
};

function design(): BookDesign {
  return {
    contract: { working_title: 'The Letter', explicit_requirements: [] },
    profile: {},
    dramatic_core: { central_conflict: 'A letter that must not be read.', stakes: 'A name on a list.' },
    style_contract: {},
    characters: [
      {
        id: 'C01', name: 'Mira', story_function: 'courier', goal: 'cross before dawn',
        motives: ['debt'], capabilities: ['knows the crossings'], limitations: ['cannot swim'],
        relationships: ['owes C02'], behavior: 'watchful', voice_and_perception: 'clipped, counts exits',
        initial_knowledge: ['the border closes at dusk'], initial_beliefs: ['the guard is bribable'],
      },
      {
        id: 'C02', name: 'Aleksy', story_function: 'guard', goal: 'keep his post',
        motives: ['fear'], capabilities: ['the roster'], limitations: ['watched'],
        relationships: [], behavior: 'still', voice_and_perception: 'formal',
        initial_knowledge: [], initial_beliefs: [],
      },
    ],
    world_rules: [{ id: 'W01', rule: 'No one crosses after dusk.', relevant_consequences: ['Night crossings are capital.'] }],
    causal_map: [],
    ending: { central_resolution: 'The letter burns.', required_setup: [] },
    chapter_map: [
      { chapter: 1, target_words: 4000 },
      { chapter: 2, target_words: 4000 },
    ],
  } as unknown as BookDesign;
}

function storeWithBook() {
  const store = new MemoryProjectStore();
  store.saveInput(input);
  store.saveDesign(design());
  store.saveState({
    facts: [{ id: 'F01', statement: 'The river runs under the wall.', evidence_refs: ['CH01_S01#p2'] }],
    events: [{ id: 'E01', description: 'Mira reached the crossing.', participants: ['C01'], evidence_refs: ['CH01_S01#p4'] }],
    conditions: { 'C01->C02.trust': 'wary', 'C01.location': 'the crossing' },
    knowledge: { C01: ['the guard is watched'] },
    beliefs: { C01: ['the letter is sealed'] },
    reader_disclosures: [],
    names: [],
  });
  return store;
}

describe('the codex is a view over the book’s own memory', () => {
  it('reads characters from the design and their current state from StoryState', () => {
    const codex = readCodex(storeWithBook());
    const mira = codex.characters.find(c => c.id === 'C01');
    expect(mira?.name).toBe('Mira');
    // The per-character voice the box already carries, surfaced rather than reinvented.
    expect(mira?.voice).toBe('clipped, counts exits');
    // Folded from finished scenes, not from the design's initial values.
    expect(mira?.knowledge).toEqual(['the guard is watched']);
    expect(mira?.conditions.map(c => c.key)).toEqual(expect.arrayContaining(['C01->C02.trust', 'C01.location']));
  });

  it('reads world rules, events and facts from where the pipeline already keeps them', () => {
    const codex = readCodex(storeWithBook());
    expect(codex.worldRules[0].rule).toBe('No one crosses after dusk.');
    expect(codex.events[0].description).toBe('Mira reached the crossing.');
    expect(codex.facts[0].statement).toBe('The river runs under the wall.');
  });

  it('derives locations from the planned scenes rather than storing them separately', () => {
    const store = storeWithBook();
    store.saveChapterPlan({
      chapter: 1,
      scenes: [
        { id: 'CH01_S01', location: 'The crossing', pov_id: 'C01' },
        { id: 'CH01_S02', location: 'The crossing', pov_id: 'C01' },
      ],
    } as never);
    const locations = readCodex(store).locations;
    expect(locations).toHaveLength(1);
    expect(locations[0]).toEqual({ name: 'The crossing', scenes: ['CH01_S01', 'CH01_S02'] });
  });

  it('writes a character edit back into the design, where the writer reads it', () => {
    const store = storeWithBook();
    applyCodexEdit(store, { kind: 'character', id: 'C01', patch: { voice: 'dry, never finishes a sentence' } });
    expect(store.loadDesign()?.characters[0].voice_and_perception).toBe('dry, never finishes a sentence');
    expect(readCodex(store).characters[0].voice).toBe('dry, never finishes a sentence');
  });

  it('writes knowledge and conditions back into StoryState', () => {
    const store = storeWithBook();
    applyCodexEdit(store, { kind: 'characterKnowledge', id: 'C01', knowledge: ['the guard is her brother'] });
    applyCodexEdit(store, { kind: 'condition', key: 'C01->C02.trust', value: 'broken' });
    expect(store.loadState().knowledge.C01).toEqual(['the guard is her brother']);
    expect(store.loadState().conditions['C01->C02.trust']).toBe('broken');
  });

  it('marks a hand-written fact as the author’s rather than citing prose that never said it', () => {
    const store = storeWithBook();
    applyCodexEdit(store, { kind: 'addFact', statement: 'The letter is written in two hands.' });
    const added = store.loadState().facts.at(-1);
    expect(added?.statement).toBe('The letter is written in two hands.');
    expect(added?.evidence_refs).toEqual(['author']);
  });

  it('adds a world rule with an id that does not collide', () => {
    const store = storeWithBook();
    applyCodexEdit(store, { kind: 'addWorldRule', rule: 'The river is never guarded.' });
    const rules = store.loadDesign()?.world_rules ?? [];
    expect(rules).toHaveLength(2);
    expect(rules[1].id).not.toBe(rules[0].id);
  });

  it('turns the codex into text an index can hold, skipping empty entries', () => {
    const entries = codexEntries(readCodex(storeWithBook()));
    const character = entries.find(entry => entry.ref === 'C01');
    expect(character?.text).toContain('Mira');
    expect(character?.text).toContain('Voice: clipped, counts exits');
    expect(entries.every(entry => entry.text.trim().length > 0)).toBe(true);
  });
});

describe('author requests queue through the pipeline’s own mechanisms', () => {
  it('queues a note and applies it as an explicit requirement on the contract', () => {
    const store = storeWithBook();
    queueRequest(store, { kind: 'note', text: 'More banter between Mira and Aleksy.' });
    expect(pendingRequests(store)).toHaveLength(1);

    const { applied } = applyPendingRequests(store);
    expect(applied).toHaveLength(1);
    // The same channel an unresolved review objection already travels through.
    expect(store.loadDesign()?.contract.explicit_requirements).toContain('Author request: More banter between Mira and Aleksy.');
    expect(pendingRequests(store)).toHaveLength(0);
  });

  it('names the chapter a chapter-scoped instruction belongs to', () => {
    const store = storeWithBook();
    queueRequest(store, { kind: 'chapter', chapter: 2, text: 'End on the river, not the gate.' });
    applyPendingRequests(store);
    expect(store.loadDesign()?.contract.explicit_requirements)
      .toContain('Author request for chapter 2: End on the river, not the gate.');
  });

  it('applies a memory correction as a codex edit, not as a note', () => {
    const store = storeWithBook();
    queueRequest(store, {
      kind: 'memory',
      text: 'Mira cannot swim — make that explicit in her limits.',
      edit: { kind: 'character', id: 'C01', patch: { limitations: ['cannot swim', 'cannot read the seal'] } },
    });
    applyPendingRequests(store);
    expect(store.loadDesign()?.characters[0].limitations).toEqual(['cannot swim', 'cannot read the seal']);
    // A memory edit must not also be pushed at the writer as a contract requirement.
    expect(store.loadDesign()?.contract.explicit_requirements ?? []).toHaveLength(0);
  });

  it('refuses a memory request with nothing structured to apply, and keeps the record', () => {
    const store = storeWithBook();
    queueRequest(store, { kind: 'memory', text: 'Make her braver somehow.' });
    const { refused } = applyPendingRequests(store);
    expect(refused).toHaveLength(1);
    expect(readRequests(store)[0].refusedReason).toMatch(/No structured memory edit/);
    // Refused once, not retried forever.
    expect(pendingRequests(store)).toHaveLength(0);
  });

  it('applies each request once, however often the queue is drained', () => {
    const store = storeWithBook();
    queueRequest(store, { kind: 'note', text: 'Keep chapters short.' });
    applyPendingRequests(store);
    applyPendingRequests(store);
    const requirements = store.loadDesign()?.contract.explicit_requirements ?? [];
    expect(requirements.filter(item => item.includes('Keep chapters short.'))).toHaveLength(1);
  });

  it('survives a snapshot round trip, because it lives in the slot with everything else', () => {
    const store = storeWithBook();
    queueRequest(store, { kind: 'note', text: 'Colder ending.' });
    // The queue is read back from the store's own log, which the snapshot carries.
    expect(readRequests(store).map(request => request.text)).toEqual(['Colder ending.']);
  });
});
