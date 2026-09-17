import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listProjects, deleteProject, saveProjectMeta } from '../../services/studioStore';
import type { StudioProject } from '../../studioTypes';
import { useI18n } from '../../i18n';
import ExportAsModal from '../common/ExportAsModal';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const Bookshelf: React.FC = () => {
  const [projects, setProjects] = useState<StudioProject[] | null>(null);
  const [exportTarget, setExportTarget] = useState<StudioProject | null>(null);
  const navigate = useNavigate();
  const { t } = useI18n();
  const fileInputs = useRef<Map<string, HTMLInputElement>>(new Map());

  const reload = () => {
    listProjects().then(setProjects);
  };

  useEffect(() => {
    reload();
  }, []);

  const handleDelete = async (project: StudioProject) => {
    if (!window.confirm(t('dashboard.confirmDelete', { title: project.title }))) return;
    await deleteProject(project.id);
    reload();
  };

  /** Cover uploaded from disk: saved as the project's coverImage (data/<id>/project.json), same
   *  field the AI-generated covers use, so it shows up in the Cover tab's history too. */
  const handleLogoUpload = async (project: StudioProject, file: File) => {
    const dataUrl = await readAsDataUrl(file);
    const entry = { id: crypto.randomUUID(), url: dataUrl, prompt: 'Uploaded from computer', createdAt: new Date().toISOString() };
    await saveProjectMeta({ ...project, coverImage: dataUrl, coverHistory: [entry, ...project.coverHistory] });
    reload();
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-zinc-100 mb-6">{t('dashboard.title')}</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <button
          onClick={() => navigate('/project/new')}
          className="flex flex-col items-center justify-center gap-2 h-64 rounded-xl border-2 border-dashed border-zinc-700 text-zinc-400 hover:border-indigo-500 hover:text-indigo-400 transition-colors"
        >
          <span className="text-4xl leading-none">+</span>
          <span className="text-sm">{t('dashboard.newBook')}</span>
        </button>

        {projects === null && (
          <div className="col-span-full text-zinc-500 text-sm">…</div>
        )}
        {projects?.length === 0 && (
          <div className="col-span-full text-zinc-500 text-sm">{t('dashboard.empty')}</div>
        )}
        {projects?.map((project) => (
          <div
            key={project.id}
            className="group relative flex flex-col h-64 rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden cursor-pointer hover:border-indigo-500/60 transition-colors"
            onClick={() => navigate(`/project/${project.id}`)}
          >
            <div className="h-36 bg-zinc-800 flex items-center justify-center overflow-hidden relative">
              {project.coverImage ? (
                <img src={project.coverImage} alt={project.title} className="w-full h-full object-cover" />
              ) : (
                <span className="text-zinc-600 text-xs">{project.genre || 'No cover'}</span>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={(el) => { if (el) fileInputs.current.set(project.id, el); }}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleLogoUpload(project, file);
                  e.target.value = '';
                }}
              />
              <button
                title="Upload cover from computer"
                onClick={(e) => { e.stopPropagation(); fileInputs.current.get(project.id)?.click(); }}
                className="absolute bottom-1 left-1 w-7 h-7 rounded-md bg-zinc-950/80 text-zinc-200 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
              >
                🖼
              </button>
            </div>
            <div className="flex-1 flex flex-col p-3 gap-1">
              <h2 className="text-sm font-medium text-zinc-100 truncate">{project.title}</h2>
              <p className="text-xs text-zinc-500">{project.genre}</p>
              <p className="text-xs text-zinc-500 mt-auto">
                {t('dashboard.chapters', { count: project.chapters.length })} · {t('dashboard.updated', { date: formatDate(project.updatedAt) })}
              </p>
            </div>
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                title={t('dashboard.export')}
                onClick={(e) => { e.stopPropagation(); setExportTarget(project); }}
                className="w-7 h-7 rounded-md bg-zinc-950/80 text-zinc-300 hover:text-indigo-400 text-xs"
              >
                ⭳
              </button>
              <button
                title={t('dashboard.delete')}
                onClick={(e) => { e.stopPropagation(); handleDelete(project); }}
                className="w-7 h-7 rounded-md bg-zinc-950/80 text-zinc-300 hover:text-red-400 text-xs"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {exportTarget && <ExportAsModal project={exportTarget} onClose={() => setExportTarget(null)} />}
    </div>
  );
};

export default Bookshelf;
