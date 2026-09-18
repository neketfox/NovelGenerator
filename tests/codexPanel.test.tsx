import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CodexPanel from '../components/codex/CodexPanel';
import AuthorRequestPanel from '../components/editor/AuthorRequestPanel';
import { ThreeZoneGenerationView } from '../components/ThreeZoneGenerationView';
import { I18nProvider } from '../i18n';
import { GenerationStep } from '../types';
import type { CodexView } from '../utils/novel/v2/codex';
import { retrieveMemory } from '../lib/rag/storeIndex';

const codex: CodexView = {
  characters: [{
    id: 'C01', name: 'Mira', storyFunction: 'courier', goal: 'cross before dawn',
    behavior: 'watchful', voice: 'clipped, counts exits',
    motives: [], capabilities: [], limitations: ['cannot swim'], relationships: [],
    knowledge: ['the guard is watched'], beliefs: [],
    conditions: [{ key: 'C01->C02.trust', value: 'wary' }],
  }],
  worldRules: [{ id: 'W01', rule: 'No one crosses after dusk.', consequences: [] }],
  events: [{ id: 'E01', description: 'Mira reached the crossing.', participants: ['C01'], evidenceRefs: ['CH01_S01#p4'] }],
  facts: [{ id: 'F01', statement: 'The river runs under the wall.', evidenceRefs: [] }],
  locations: [{ name: 'The crossing', scenes: ['CH01_S01'] }],
};

const wrap = (node: React.ReactNode) => renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);

describe('codex panel', () => {
  it('shows the character voice the pipeline actually reads', () => {
    const html = wrap(<CodexPanel codex={codex} onEdit={() => {}} />);
    expect(html).toContain('Mira');
    expect(html).toContain('clipped, counts exits');
    // The design's own id is shown, because state conditions and scene plans refer to it.
    expect(html).toContain('C01');
  });

  it('shows the current relationship state, not just the design card', () => {
    const html = wrap(<CodexPanel codex={codex} onEdit={() => {}} />);
    expect(html).toContain('C01-&gt;C02.trust');
    expect(html).toContain('wary');
  });
});

describe('author request panel', () => {
  it('lists queued requests with their status', () => {
    const html = wrap(
      <AuthorRequestPanel
        chapterCount={3}
        requests={[
          { id: 'AR1', kind: 'note', text: 'More banter.', createdAt: '2026-01-01T00:00:00Z' },
          { id: 'AR2', kind: 'chapter', chapter: 2, text: 'End at the river.', createdAt: '2026-01-01T00:00:00Z', appliedAt: '2026-01-01T01:00:00Z' },
        ]}
        onQueue={() => {}}
      />,
    );
    expect(html).toContain('More banter.');
    expect(html).toContain('queued');
    expect(html).toContain('applied');
    expect(html).toContain('ch.2');
  });

  it('says why a request waits instead of applying at once', () => {
    const html = wrap(<AuthorRequestPanel chapterCount={1} requests={[]} onQueue={() => {}} />);
    expect(html).toContain('applied between chapters');
  });
});

describe('the generation page carries the panels', () => {
  const base = {
    currentStep: GenerationStep.GeneratingChapters,
    currentChapterProcessing: 1,
    totalChaptersToProcess: 3,
    currentStoryOutline: 'Central conflict: a closed border.',
    currentChapterPlan: '{}',
    generatedChapters: [{ title: 'Chapter 1', content: 'The guard did not look up.' }],
    agentLogs: [{ timestamp: Date.now(), chapterNumber: 1, type: 'execution' as const, message: 'Writing a scene' }],
  };

  it('offers the codex, cover and request tabs beside the inspector', () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <ThreeZoneGenerationView {...base} codexPanel={<div />} coverPanel={<div />} requestPanel={<div />} />
      </I18nProvider>,
    );
    expect(html).toContain('Codex');
    expect(html).toContain('Cover');
    expect(html).toContain('Requests');
  });

  it('still shows the inspector by default, so a run looks unchanged until a tab is chosen', () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <ThreeZoneGenerationView {...base} codexPanel={<div data-testid="codex" />} />
      </I18nProvider>,
    );
    expect(html).toContain('data-testid="zone-agent-inspector"');
    expect(html).not.toContain('data-testid="codex"');
  });
});

describe('semantic retrieval degrades instead of failing the book', () => {
  it('returns nothing when the index cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await retrieveMemory('some-book', 'a scene about a border')).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('returns nothing for an empty query rather than retrieving at random', async () => {
    expect(await retrieveMemory('some-book', '   ')).toEqual([]);
  });
});
