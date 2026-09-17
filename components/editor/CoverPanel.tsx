import React, { useState } from 'react';
import type { CoverHistoryEntry } from '../../studioTypes';
import { generateCoverImage } from '../../lib/image/geminiImage';
import { useI18n } from '../../i18n';

interface Props {
  title: string;
  synopsis: string;
  genre: string;
  currentCover?: string;
  history: CoverHistoryEntry[];
  onChange: (coverImage: string, history: CoverHistoryEntry[]) => void;
}

const CoverPanel: React.FC<Props> = ({ title, synopsis, genre, currentCover, history, onChange }) => {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState(`${genre ? genre + ' book cover' : 'Book cover'} for "${title}". ${synopsis.slice(0, 200)}`);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const url = await generateCoverImage(prompt);
      const entry: CoverHistoryEntry = { id: crypto.randomUUID(), url, prompt, createdAt: new Date().toISOString() };
      onChange(url, [entry, ...history]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4">
        <div className="w-48 h-64 bg-zinc-800 rounded-lg overflow-hidden flex items-center justify-center shrink-0">
          {currentCover ? <img src={currentCover} className="w-full h-full object-cover" alt={title} /> : <span className="text-zinc-600 text-xs">No cover</span>}
        </div>
        <div className="flex-1 flex flex-col gap-2">
          <textarea
            className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-sm text-zinc-200 h-24"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t('covers.prompt')}
          />
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="self-start px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm"
          >
            {generating ? '…' : t('covers.generate')}
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </div>

      {history.length > 0 && (
        <div>
          <h3 className="text-sm text-zinc-400 mb-2">{t('covers.history')}</h3>
          <div className="flex gap-2 flex-wrap">
            {history.map((h) => (
              <button
                key={h.id}
                onClick={() => onChange(h.url, history)}
                className={`w-16 h-20 rounded-md overflow-hidden border ${h.url === currentCover ? 'border-indigo-500' : 'border-zinc-800'}`}
                title={h.prompt}
              >
                <img src={h.url} className="w-full h-full object-cover" alt="" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CoverPanel;
