import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listSlots, deleteSlot, type SlotSummary } from '../../services/projectSlots';
import { useI18n } from '../../i18n';
import ImportBookModal from './ImportBookModal';

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

/**
 * The bookshelf lists the generator's own project slots from data/ — the same snapshots the
 * run resumes from — so a book started here, a book half-written and a book finished are all
 * one kind of thing. Opening a card opens that book's generation page; an unfinished book is
 * offered here rather than as a surprise card on the creation form.
 */
const Bookshelf: React.FC = () => {
  const [slots, setSlots] = useState<SlotSummary[] | null>(null);
  const [importing, setImporting] = useState(false);
  const navigate = useNavigate();
  const { t } = useI18n();

  const reload = () => { listSlots().then(setSlots); };
  useEffect(() => { reload(); }, []);

  const handleDelete = async (slot: SlotSummary) => {
    if (!window.confirm(t('dashboard.confirmDelete', { title: slot.title }))) return;
    await deleteSlot(slot.id);
    reload();
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-zinc-100 mb-6">{t('dashboard.title')}</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <button
          onClick={() => navigate('/project/new')}
          className="flex flex-col items-center justify-center gap-2 h-56 rounded-xl border-2 border-dashed border-zinc-700 text-zinc-400 hover:border-indigo-500 hover:text-indigo-400 transition-colors"
        >
          <span className="text-4xl leading-none">+</span>
          <span className="text-sm">{t('dashboard.newBook')}</span>
        </button>

        <button
          onClick={() => setImporting(true)}
          className="flex flex-col items-center justify-center gap-2 h-56 rounded-xl border-2 border-dashed border-zinc-700 text-zinc-400 hover:border-indigo-500 hover:text-indigo-400 transition-colors px-4 text-center"
        >
          <span className="text-3xl leading-none">&#8681;</span>
          <span className="text-sm">{t('dashboard.importBook')}</span>
          <span className="text-xs text-zinc-600">{t('dashboard.importHint')}</span>
        </button>

        {slots === null && <div className="col-span-full text-zinc-500 text-sm">…</div>}
        {slots?.length === 0 && <div className="col-span-full text-zinc-500 text-sm">{t('dashboard.empty')}</div>}

        {slots?.map((slot) => (
          <div
            key={slot.id}
            className="group relative flex flex-col h-56 rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden cursor-pointer hover:border-indigo-500/60 transition-colors"
            onClick={() => navigate(`/project/${slot.id}`)}
          >
            <div className="flex-1 flex flex-col p-4 gap-1.5">
              <h2 className="text-sm font-medium text-zinc-100 line-clamp-2">{slot.title}</h2>
              <p className="text-xs text-zinc-500">{slot.genre}</p>
              {slot.unfinished && (
                <p className="text-xs text-amber-400/90 mt-1">
                  {t('wizard.app.unfinishedFound', { count: slot.chaptersWritten, total: slot.chapterCount })}
                </p>
              )}
              <p className="text-xs text-zinc-500 mt-auto">
                {slot.chaptersWritten}/{slot.chapterCount} · {t('dashboard.updated', { date: formatDate(slot.updatedAt) })}
              </p>
              {slot.unfinished && (
                <span className="text-xs text-indigo-400">{t('wizard.app.continueWriting')} →</span>
              )}
            </div>
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                title={t('dashboard.delete')}
                onClick={(e) => { e.stopPropagation(); handleDelete(slot); }}
                className="w-7 h-7 rounded-md bg-zinc-950/80 text-zinc-300 hover:text-red-400 text-xs"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
      {importing && <ImportBookModal onClose={() => { setImporting(false); reload(); }} />}
    </div>
  );
};

export default Bookshelf;
