import React, { useState } from 'react';
import type { CodexView, CodexEdit } from '../../utils/novel/v2/codex';
import { useI18n } from '../../i18n';

interface Props {
  codex: CodexView;
  onEdit: (edit: CodexEdit) => void;
}

type Tab = 'characters' | 'locations' | 'events' | 'worldRules';

const fieldClass = 'w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300';

/**
 * The codex, editing the book's live memory in place: character cards and world rules are the
 * design's, knowledge and conditions are StoryState's, locations are where the plans put the
 * scenes. Nothing here is stored beside them.
 */
const CodexPanel: React.FC<Props> = ({ codex, onEdit }) => {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('characters');
  const [draftRule, setDraftRule] = useState('');
  const [draftFact, setDraftFact] = useState('');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'characters', label: t('codex.characters') },
    { key: 'locations', label: t('codex.locations') },
    { key: 'events', label: t('codex.events') },
    { key: 'worldRules', label: t('codex.worldRules') },
  ];

  return (
    <div className="flex flex-col min-h-0 flex-1 gap-2">
      <div className="shrink-0 flex flex-wrap gap-1">
        {tabs.map(item => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`px-2 py-0.5 text-xs rounded ${tab === item.key ? 'bg-zinc-200 text-zinc-900' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-2">
        {tab === 'characters' && codex.characters.map(character => (
          <div key={character.id} className="border border-zinc-800 rounded p-2 flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-zinc-200">{character.name}</span>
              <span className="font-mono text-xs text-zinc-600">{character.id}</span>
            </div>
            <label className="text-xs text-zinc-500">
              {t('codex.voice')}
              <textarea
                className={fieldClass}
                defaultValue={character.voice}
                onBlur={event => onEdit({ kind: 'character', id: character.id, patch: { voice: event.target.value } })}
              />
            </label>
            <label className="text-xs text-zinc-500">
              {t('codex.behavior')}
              <textarea
                className={fieldClass}
                defaultValue={character.behavior}
                onBlur={event => onEdit({ kind: 'character', id: character.id, patch: { behavior: event.target.value } })}
              />
            </label>
            <label className="text-xs text-zinc-500">
              {t('codex.limitations')}
              <textarea
                className={fieldClass}
                defaultValue={character.limitations.join('\n')}
                onBlur={event => onEdit({
                  kind: 'character',
                  id: character.id,
                  patch: { limitations: event.target.value.split('\n').map(line => line.trim()).filter(Boolean) },
                })}
              />
            </label>
            {character.knowledge.length > 0 && (
              <label className="text-xs text-zinc-500">
                {t('codex.knowledge')}
                <textarea
                  className={fieldClass}
                  defaultValue={character.knowledge.join('\n')}
                  onBlur={event => onEdit({
                    kind: 'characterKnowledge',
                    id: character.id,
                    knowledge: event.target.value.split('\n').map(line => line.trim()).filter(Boolean),
                  })}
                />
              </label>
            )}
            {character.conditions.length > 0 && (
              <div className="text-xs text-zinc-500">
                {character.conditions.map(condition => (
                  <div key={condition.key} className="flex items-center gap-1">
                    <span className="font-mono text-zinc-600">{condition.key}</span>
                    <input
                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-1 text-xs text-zinc-300"
                      defaultValue={condition.value}
                      onBlur={event => onEdit({ kind: 'condition', key: condition.key, value: event.target.value })}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {tab === 'locations' && (
          codex.locations.length
            ? codex.locations.map(location => (
                <div key={location.name} className="border border-zinc-800 rounded p-2">
                  <div className="text-xs text-zinc-200">{location.name}</div>
                  <div className="font-mono text-xs text-zinc-600">{location.scenes.join(', ')}</div>
                </div>
              ))
            : <p className="text-xs text-zinc-600">{t('codex.locationsEmpty')}</p>
        )}

        {tab === 'events' && (
          <>
            {codex.events.map(event => (
              <div key={event.id} className="border border-zinc-800 rounded p-2 flex flex-col gap-1">
                <textarea
                  className={fieldClass}
                  defaultValue={event.description}
                  onBlur={e => onEdit({ kind: 'event', id: event.id, description: e.target.value })}
                />
                <span className="font-mono text-xs text-zinc-600">{event.evidenceRefs.join(', ') || '—'}</span>
              </div>
            ))}
            {codex.facts.map(fact => (
              <div key={fact.id} className="border border-zinc-800 rounded p-2 flex flex-col gap-1">
                <textarea
                  className={fieldClass}
                  defaultValue={fact.statement}
                  onBlur={e => onEdit({ kind: 'fact', id: fact.id, statement: e.target.value })}
                />
                <span className="font-mono text-xs text-zinc-600">{fact.evidenceRefs.join(', ') || '—'}</span>
              </div>
            ))}
            <div className="flex gap-1">
              <input
                className={fieldClass}
                placeholder={t('codex.addFactPlaceholder')}
                value={draftFact}
                onChange={e => setDraftFact(e.target.value)}
              />
              <button
                type="button"
                className="text-xs px-2 text-indigo-400 hover:text-indigo-300"
                onClick={() => { if (draftFact.trim()) { onEdit({ kind: 'addFact', statement: draftFact.trim() }); setDraftFact(''); } }}
              >
                {t('codex.add')}
              </button>
            </div>
          </>
        )}

        {tab === 'worldRules' && (
          <>
            {codex.worldRules.map(rule => (
              <div key={rule.id} className="border border-zinc-800 rounded p-2">
                <textarea
                  className={fieldClass}
                  defaultValue={rule.rule}
                  onBlur={e => onEdit({ kind: 'worldRule', id: rule.id, rule: e.target.value })}
                />
              </div>
            ))}
            <div className="flex gap-1">
              <input
                className={fieldClass}
                placeholder={t('codex.addRulePlaceholder')}
                value={draftRule}
                onChange={e => setDraftRule(e.target.value)}
              />
              <button
                type="button"
                className="text-xs px-2 text-indigo-400 hover:text-indigo-300"
                onClick={() => { if (draftRule.trim()) { onEdit({ kind: 'addWorldRule', rule: draftRule.trim() }); setDraftRule(''); } }}
              >
                {t('codex.add')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CodexPanel;
