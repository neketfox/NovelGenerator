import React, { useState } from 'react';
import type { StudioProject, CharacterEntry, LocationEntry, EventEntry, WorldRuleEntry } from '../../studioTypes';
import { indexCodexEntry, removeCodexEntry } from '../../lib/rag';
import { extractEntitiesFromChapter, reviseCodexText, checkCanonConsistency, type CanonCheckReport } from '../../services/studioAi';
import { useI18n } from '../../i18n';

/** "AI edit" (rewrite one field from an instruction) and "Check canon" (does the rest of the
 *  book now contradict this entry?), attached under any codex entry's main text field. */
const CodexEntryTools: React.FC<{
  project: StudioProject;
  entryLabel: string;
  fullText: string;
  mainText: string;
  onMainTextChange: (next: string) => void;
}> = ({ project, entryLabel, fullText, mainText, onMainTextChange }) => {
  const [instruction, setInstruction] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<'edit' | 'check' | null>(null);
  const [report, setReport] = useState<CanonCheckReport | null>(null);

  const handleAiEdit = async () => {
    setBusy('edit');
    try {
      const revised = await reviseCodexText(project, mainText, instruction);
      onMainTextChange(revised);
      setEditing(false);
      setInstruction('');
    } finally {
      setBusy(null);
    }
  };

  const handleCheckCanon = async () => {
    setBusy('check');
    setReport(null);
    try {
      setReport(await checkCanonConsistency(project, entryLabel, fullText));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <button type="button" onClick={() => setEditing((v) => !v)} className="text-xs text-indigo-400 hover:text-indigo-300">
          AI edit
        </button>
        <button type="button" onClick={() => void handleCheckCanon()} disabled={busy === 'check'} className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50">
          {busy === 'check' ? '…' : 'Check canon'}
        </button>
      </div>
      {editing && (
        <div className="flex gap-2">
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. make this darker, add a scar on the left hand…"
            className="flex-1 bg-zinc-950 rounded px-2 py-1 text-xs text-zinc-200"
          />
          <button type="button" onClick={() => void handleAiEdit()} disabled={busy === 'edit'} className="text-xs px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50">
            {busy === 'edit' ? '…' : 'Apply'}
          </button>
        </div>
      )}
      {report && (
        <div className="text-xs bg-zinc-950 rounded-md p-2">
          {report.conflicts.length === 0 ? (
            <p className="text-emerald-400">No conflicts found with what's already written.</p>
          ) : (
            <ul className="list-disc list-inside space-y-1 text-zinc-300">
              {report.conflicts.map((c, i) => (
                <li key={i}><span className="text-amber-400">{c.where}:</span> {c.issue}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

type Tab = 'characters' | 'locations' | 'events' | 'worldRules';

interface Props {
  project: StudioProject;
  onUpdate: (next: StudioProject) => void;
  activeChapterNumber?: number;
}

function newId() {
  return crypto.randomUUID();
}

const CodexManager: React.FC<Props> = ({ project, onUpdate, activeChapterNumber }) => {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('characters');
  const [extracting, setExtracting] = useState(false);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'characters', label: t('codex.characters') },
    { key: 'locations', label: t('codex.locations') },
    { key: 'events', label: t('codex.events') },
    { key: 'worldRules', label: t('codex.worldRules') },
  ];

  const addCharacter = () => {
    const entry: CharacterEntry = { id: newId(), name: 'New Character', role: '', description: '', personality: '', goals: '', relationships: '' };
    onUpdate({ ...project, codex: { ...project.codex, characters: [...project.codex.characters, entry] } });
    void indexCodexEntry(project.id, { kind: 'character', entry });
  };
  const addLocation = () => {
    const entry: LocationEntry = { id: newId(), name: 'New Location', description: '', significance: '', connectedLocations: [] };
    onUpdate({ ...project, codex: { ...project.codex, locations: [...project.codex.locations, entry] } });
    void indexCodexEntry(project.id, { kind: 'location', entry });
  };
  const addEvent = () => {
    const entry: EventEntry = { id: newId(), timelinePosition: project.codex.events.length, title: 'New Event', summary: '', keyOutcomes: '', affectedEntities: [] };
    onUpdate({ ...project, codex: { ...project.codex, events: [...project.codex.events, entry] } });
    void indexCodexEntry(project.id, { kind: 'event', entry });
  };
  const addWorldRule = () => {
    const entry: WorldRuleEntry = { id: newId(), category: 'General', rule: 'New rule', exceptions: '' };
    onUpdate({ ...project, codex: { ...project.codex, worldRules: [...project.codex.worldRules, entry] } });
    void indexCodexEntry(project.id, { kind: 'worldRule', entry });
  };

  const updateCharacter = (id: string, patch: Partial<CharacterEntry>) => {
    const characters = project.codex.characters.map((c) => (c.id === id ? { ...c, ...patch } : c));
    onUpdate({ ...project, codex: { ...project.codex, characters } });
    const entry = characters.find((c) => c.id === id);
    if (entry) void indexCodexEntry(project.id, { kind: 'character', entry });
  };
  const updateLocation = (id: string, patch: Partial<LocationEntry>) => {
    const locations = project.codex.locations.map((l) => (l.id === id ? { ...l, ...patch } : l));
    onUpdate({ ...project, codex: { ...project.codex, locations } });
    const entry = locations.find((l) => l.id === id);
    if (entry) void indexCodexEntry(project.id, { kind: 'location', entry });
  };
  const updateEvent = (id: string, patch: Partial<EventEntry>) => {
    const events = project.codex.events.map((e) => (e.id === id ? { ...e, ...patch } : e));
    onUpdate({ ...project, codex: { ...project.codex, events } });
    const entry = events.find((e) => e.id === id);
    if (entry) void indexCodexEntry(project.id, { kind: 'event', entry });
  };
  const updateWorldRule = (id: string, patch: Partial<WorldRuleEntry>) => {
    const worldRules = project.codex.worldRules.map((w) => (w.id === id ? { ...w, ...patch } : w));
    onUpdate({ ...project, codex: { ...project.codex, worldRules } });
    const entry = worldRules.find((w) => w.id === id);
    if (entry) void indexCodexEntry(project.id, { kind: 'worldRule', entry });
  };

  const remove = (kind: Tab, id: string) => {
    onUpdate({ ...project, codex: { ...project.codex, [kind]: (project.codex[kind] as { id: string }[]).filter((e) => e.id !== id) } });
    void removeCodexEntry(project.id, id);
  };

  const handleExtract = async () => {
    const chapter = project.chapters.find((c) => c.chapterNumber === activeChapterNumber) ?? project.chapters[0];
    if (!chapter) return;
    setExtracting(true);
    try {
      const extracted = await extractEntitiesFromChapter(project, chapter);
      const newCharacters = extracted.characters.map((c) => ({ id: newId(), name: c.name, role: c.role, description: c.description, personality: '', goals: '', relationships: '' }));
      const newLocations = extracted.locations.map((l) => ({ id: newId(), name: l.name, description: l.description, significance: '', connectedLocations: [] }));
      const newEvents = extracted.events.map((e) => ({ id: newId(), timelinePosition: project.codex.events.length, title: e.title, summary: e.summary, keyOutcomes: '', affectedEntities: [] }));
      const nextProject: StudioProject = {
        ...project,
        codex: {
          ...project.codex,
          characters: [...project.codex.characters, ...newCharacters],
          locations: [...project.codex.locations, ...newLocations],
          events: [...project.codex.events, ...newEvents],
        },
      };
      onUpdate(nextProject);
      for (const entry of newCharacters) void indexCodexEntry(project.id, { kind: 'character', entry });
      for (const entry of newLocations) void indexCodexEntry(project.id, { kind: 'location', entry });
      for (const entry of newEvents) void indexCodexEntry(project.id, { kind: 'event', entry });
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-zinc-900 rounded-lg p-1">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`px-3 py-1.5 text-sm rounded-md ${tab === tb.key ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              {tb.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleExtract}
          disabled={extracting || !project.chapters.length}
          className="text-xs px-3 py-1.5 rounded-md border border-zinc-700 text-zinc-300 hover:border-indigo-500 disabled:opacity-50"
        >
          {extracting ? '…' : t('codex.extract')}
        </button>
      </div>

      {tab === 'characters' && (
        <div className="grid gap-3">
          {project.codex.characters.map((c) => (
            <div key={c.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-2">
              <div className="flex justify-between">
                <input className="bg-transparent text-zinc-100 font-medium outline-none" value={c.name} onChange={(e) => updateCharacter(c.id, { name: e.target.value })} />
                <button onClick={() => remove('characters', c.id)} className="text-zinc-500 hover:text-red-400 text-xs">✕</button>
              </div>
              <input className="w-full bg-zinc-800 rounded px-2 py-1 text-xs text-zinc-300" placeholder="Role" value={c.role} onChange={(e) => updateCharacter(c.id, { role: e.target.value })} />
              <textarea className="w-full bg-zinc-800 rounded px-2 py-1 text-xs text-zinc-300" placeholder="Description" value={c.description} onChange={(e) => updateCharacter(c.id, { description: e.target.value })} />
              <textarea className="w-full bg-zinc-800 rounded px-2 py-1 text-xs text-zinc-300" placeholder="Personality" value={c.personality} onChange={(e) => updateCharacter(c.id, { personality: e.target.value })} />
              <textarea className="w-full bg-zinc-800 rounded px-2 py-1 text-xs text-zinc-300" placeholder="Goals" value={c.goals} onChange={(e) => updateCharacter(c.id, { goals: e.target.value })} />
              <textarea className="w-full bg-zinc-800 rounded px-2 py-1 text-xs text-zinc-300" placeholder="Relationships" value={c.relationships} onChange={(e) => updateCharacter(c.id, { relationships: e.target.value })} />
              <CodexEntryTools
                project={project}
                entryLabel={`character: ${c.name}`}
                fullText={[c.name, c.role, c.description, c.personality, c.goals, c.relationships].filter(Boolean).join('. ')}
                mainText={c.description}
                onMainTextChange={(next) => updateCharacter(c.id, { description: next })}
              />
            </div>
          ))}
          <button onClick={addCharacter} className="text-sm text-indigo-400 hover:text-indigo-300 self-start">+ {t('codex.add')}</button>
        </div>
      )}

      {tab === 'locations' && (
        <div className="grid gap-3">
          {project.codex.locations.map((l) => (
            <div key={l.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-2">
              <div className="flex justify-between">
                <input className="bg-transparent text-zinc-100 font-medium outline-none" value={l.name} onChange={(e) => updateLocation(l.id, { name: e.target.value })} />
                <button onClick={() => remove('locations', l.id)} className="text-zinc-500 hover:text-red-400 text-xs">✕</button>
              </div>
              <textarea className="w-full bg-zinc-800 rounded px-2 py-1 text-xs text-zinc-300" placeholder="Description" value={l.description} onChange={(e) => updateLocation(l.id, { description: e.target.value })} />
              <textarea className="w-full bg-zinc-800 rounded px-2 py-1 text-xs text-zinc-300" placeholder="Narrative significance" value={l.significance} onChange={(e) => updateLocation(l.id, { significance: e.target.value })} />
              <CodexEntryTools
                project={project}
                entryLabel={`location: ${l.name}`}
                fullText={[l.name, l.description, l.significance].filter(Boolean).join('. ')}
                mainText={l.description}
                onMainTextChange={(next) => updateLocation(l.id, { description: next })}
              />
            </div>
          ))}
          <button onClick={addLocation} className="text-sm text-indigo-400 hover:text-indigo-300 self-start">+ {t('codex.add')}</button>
        </div>
      )}

      {tab === 'events' && (
        <div className="grid gap-3">
          {project.codex.events
            .slice()
            .sort((a, b) => a.timelinePosition - b.timelinePosition)
            .map((e) => (
              <div key={e.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-2">
                <div className="flex justify-between gap-2">
                  <input className="bg-transparent text-zinc-100 font-medium outline-none flex-1" value={e.title} onChange={(ev) => updateEvent(e.id, { title: ev.target.value })} />
                  <input type="number" className="w-16 bg-zinc-800 rounded px-2 text-xs text-zinc-300" value={e.timelinePosition} onChange={(ev) => updateEvent(e.id, { timelinePosition: Number(ev.target.value) })} />
                  <button onClick={() => remove('events', e.id)} className="text-zinc-500 hover:text-red-400 text-xs">✕</button>
                </div>
                <textarea className="w-full bg-zinc-800 rounded px-2 py-1 text-xs text-zinc-300" placeholder="Summary" value={e.summary} onChange={(ev) => updateEvent(e.id, { summary: ev.target.value })} />
                <textarea className="w-full bg-zinc-800 rounded px-2 py-1 text-xs text-zinc-300" placeholder="Key outcomes" value={e.keyOutcomes} onChange={(ev) => updateEvent(e.id, { keyOutcomes: ev.target.value })} />
                <CodexEntryTools
                  project={project}
                  entryLabel={`event: ${e.title}`}
                  fullText={[e.title, e.summary, e.keyOutcomes].filter(Boolean).join('. ')}
                  mainText={e.summary}
                  onMainTextChange={(next) => updateEvent(e.id, { summary: next })}
                />
              </div>
            ))}
          <button onClick={addEvent} className="text-sm text-indigo-400 hover:text-indigo-300 self-start">+ {t('codex.add')}</button>
        </div>
      )}

      {tab === 'worldRules' && (
        <div className="grid gap-3">
          {project.codex.worldRules.map((w) => (
            <div key={w.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-2">
              <div className="flex justify-between">
                <input className="bg-transparent text-zinc-100 font-medium outline-none" value={w.category} onChange={(e) => updateWorldRule(w.id, { category: e.target.value })} />
                <button onClick={() => remove('worldRules', w.id)} className="text-zinc-500 hover:text-red-400 text-xs">✕</button>
              </div>
              <textarea className="w-full bg-zinc-800 rounded px-2 py-1 text-xs text-zinc-300" placeholder="Rule" value={w.rule} onChange={(e) => updateWorldRule(w.id, { rule: e.target.value })} />
              <textarea className="w-full bg-zinc-800 rounded px-2 py-1 text-xs text-zinc-300" placeholder="Exceptions" value={w.exceptions} onChange={(e) => updateWorldRule(w.id, { exceptions: e.target.value })} />
              <CodexEntryTools
                project={project}
                entryLabel={`world rule: ${w.category}`}
                fullText={[w.category, w.rule, w.exceptions].filter(Boolean).join('. ')}
                mainText={w.rule}
                onMainTextChange={(next) => updateWorldRule(w.id, { rule: next })}
              />
            </div>
          ))}
          <button onClick={addWorldRule} className="text-sm text-indigo-400 hover:text-indigo-300 self-start">+ {t('codex.add')}</button>
        </div>
      )}
    </div>
  );
};

export default CodexManager;
