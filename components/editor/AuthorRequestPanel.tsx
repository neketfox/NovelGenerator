import React, { useState } from 'react';
import type { AuthorRequest, AuthorRequestKind } from '../../utils/novel/v2/authorRequests';
import { useI18n } from '../../i18n';

interface Props {
  requests: AuthorRequest[];
  /** Chapters the author can attach an instruction to. */
  chapterCount: number;
  onQueue: (kind: AuthorRequestKind, text: string, chapter?: number) => void;
}

/**
 * Asking for changes while the book is being written. Nothing is applied here and now: each
 * request is queued and picked up between chapters, because an edit landing in the middle of
 * a scene would change the memory that scene was already written against.
 */
const AuthorRequestPanel: React.FC<Props> = ({ requests, chapterCount, onQueue }) => {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [kind, setKind] = useState<AuthorRequestKind>('note');
  const [chapter, setChapter] = useState<number>(1);

  const submit = () => {
    if (!text.trim()) return;
    onQueue(kind, text.trim(), kind === 'chapter' ? chapter : undefined);
    setText('');
  };

  const kinds: { key: AuthorRequestKind; label: string }[] = [
    { key: 'note', label: t('requests.kind.note') },
    { key: 'chapter', label: t('requests.kind.chapter') },
    { key: 'memory', label: t('requests.kind.memory') },
  ];

  return (
    <div className="flex flex-col min-h-0 flex-1 gap-2">
      <p className="shrink-0 text-xs text-zinc-500">{t('requests.explainer')}</p>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-1.5">
        {requests.length === 0 && <p className="text-xs text-zinc-600">{t('requests.empty')}</p>}
        {requests.map(request => {
          let status = t('requests.pending');
          if (request.appliedAt) status = t('requests.applied');
          else if (request.refusedReason) status = request.refusedReason;
          return (
            <div key={request.id} className="border border-zinc-800 rounded p-2">
              <div className="text-xs text-zinc-300">{request.text}</div>
              <div className="flex items-baseline justify-between gap-2 mt-1">
                <span className="font-mono text-xs text-zinc-600">
                  {request.kind}{request.chapter ? ` · ch.${request.chapter}` : ''}
                </span>
                <span className={`text-xs ${request.appliedAt ? 'text-emerald-400' : request.refusedReason ? 'text-amber-400' : 'text-zinc-500'}`}>
                  {status}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="shrink-0 flex flex-col gap-1.5 border-t border-zinc-800 pt-2">
        <div className="flex flex-wrap gap-1">
          {kinds.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => setKind(item.key)}
              className={`px-2 py-0.5 text-xs rounded ${kind === item.key ? 'bg-zinc-200 text-zinc-900' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              {item.label}
            </button>
          ))}
          {kind === 'chapter' && (
            <select
              value={chapter}
              onChange={event => setChapter(Number(event.target.value))}
              className="bg-zinc-900 border border-zinc-800 rounded px-1 text-xs text-zinc-300"
            >
              {Array.from({ length: Math.max(1, chapterCount) }, (_, index) => index + 1).map(number => (
                <option key={number} value={number}>{number}</option>
              ))}
            </select>
          )}
        </div>
        <textarea
          className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300"
          rows={3}
          placeholder={t('requests.placeholder')}
          value={text}
          onChange={event => setText(event.target.value)}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim()}
          className="self-end text-xs px-3 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-300 rounded disabled:opacity-40"
        >
          {t('requests.queue')}
        </button>
      </div>
    </div>
  );
};

export default AuthorRequestPanel;
