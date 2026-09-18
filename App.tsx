


import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from './i18n';
import useBookGenerator, { splitError } from './hooks/useBookGenerator';
import { RunClock } from './components/RunClock';
import { GenerationStep } from './types';
import { MIN_CHAPTERS } from './constants';
import UserInput from './components/UserInput';
import ThemeToggle from './components/ThemeToggle';
import SystemManualToggle from './components/SystemManualModal';
import BookDisplay from './components/BookDisplay';
import SaveBook from './components/SaveBook';
import { LoadingSpinner } from './components/common/LoadingSpinner';

import AgentActivityLog from './components/AgentActivityLog';
import ThreeZoneGenerationView from './components/ThreeZoneGenerationView';
import { installConsoleBridge, logToTerminal, watchMainThreadStalls } from './utils/terminalLogger';
import LanguageSelector from './components/common/LanguageSelector';
import ApiKeyManagerModal from './components/common/ApiKeyManagerModal';
import UsageStatsModal from './components/usage/UsageStatsModal';
import ExportAsModal from './components/common/ExportAsModal';
import CodexPanel from './components/codex/CodexPanel';
import CoverPanel from './components/editor/CoverPanel';
import AuthorRequestPanel from './components/editor/AuthorRequestPanel';
import { chaptersToStudioProject } from './services/importFromGenerator';
import { decideProjectView } from './utils/projectView';

const App: React.FC = () => {
  const navigate = useNavigate();
  const { id: routeProjectId } = useParams<{ id: string }>();
  const { t, language } = useI18n();
  const [showKeys, setShowKeys] = React.useState(false);
  const [showExportAs, setShowExportAs] = React.useState(false);
  const [showStats, setShowStats] = React.useState(false);
  const {
    storyPremise,
    setStoryPremise,
    numChapters,
    setNumChapters,
    storySettings,
    setStorySettings,
    startGeneration,
    continueGeneration,
    pauseGeneration,
    isLoading,
    currentStep,
    error,
    finalBookContent,
    finalMetadataJson,
    generatedChapters,
    currentChapterProcessing,
    totalChaptersToProcess,
    resetGenerator,
    editSettings,
    currentStoryOutline,
    currentChapterPlan,
    isResumable,
    agentLogs,
    lastSavedAt,
    exportProject,
    importProject,
    storeReady,
    readCodexView,
    editCodex,
    listAuthorRequests,
    addAuthorRequest,
    memoryRevision,
  } = useBookGenerator(
    routeProjectId,
    // The book exists on disk from its first chapter: move the URL onto its slot so a closed
    // browser (or a crash mid-run) reopens this very book instead of an empty form.
    React.useCallback((id: string) => navigate(`/project/${id}`, { replace: true }), [navigate]),
  );

  const hasConnectedRef = React.useRef(false);
  // What the application is doing, readable from outside a render. The stall watch reports the step a
  // block happened during, and a ref is the only way to read the current one from a listener that
  // outlives the render it was installed in.
  const doingRef = React.useRef('starting up');
  doingRef.current = `${currentStep}${currentChapterProcessing ? ` · chapter ${currentChapterProcessing}` : ''}${isLoading ? '' : ' · idle'}`;

  useEffect(() => {
    installConsoleBridge();
    if (!hasConnectedRef.current) {
      hasConnectedRef.current = true;
      logToTerminal('Client interface connected & ready', 'System', 'info');
    }
    const watch = watchMainThreadStalls(() => doingRef.current);
    return () => watch.stop();
  }, []);


  const handleStartGeneration = () => {
    if (!storeReady) return;
    if (storyPremise && numChapters >= MIN_CHAPTERS) {
      startGeneration(storyPremise, numChapters);
    } else {
      // Basic validation feedback, can be improved
      alert(t('wizard.app.validationAlert', { minChapters: MIN_CHAPTERS }));
    }
  };

  const handleContinue = () => {
    continueGeneration();
  };

  const handleReset = () => {
    resetGenerator();
  };

  // /project/new is the creation form; /project/:id is a book, and a book always opens on its
  // own page — running, paused or waiting to be resumed — instead of throwing the author back
  // at a form or an "unfinished book found" card (that card now lives on the dashboard).
  const isCreating = !routeProjectId;
  const hasStoredWork = generatedChapters.length > 0 || !!currentStoryOutline;

  // One decision, so no combination can fall through the gaps and render an empty page.
  const view = decideProjectView({
    isCreating,
    storeReady,
    isLoading,
    currentStep,
    hasStoredWork,
    hasFinalBook: !!finalBookContent,
  });
  const showProgress = view === 'progress';

  const isStudioLayout = showProgress;

  // The metadata document runs to hundreds of kilobytes on a finished book, and this parsed it on every
  // render — twice over, since BookDisplay parses it too and its memo missed on a string rebuilt each
  // time. Parsed once per document now.
  const savedMetadata = React.useMemo(() => {
    try { return finalMetadataJson ? JSON.parse(finalMetadataJson) : {}; } catch { return {}; }
  }, [finalMetadataJson]);
  const saveControl = finalBookContent ? (
    <SaveBook content={finalBookContent} metadata={savedMetadata} />
  ) : generatedChapters.some(chapter => chapter.content.trim()) ? (
    <SaveBook draft content={'# Manuscript — Draft\n\n' + generatedChapters.map((chapter, index) => chapter.content.trim() ? `## Chapter ${index + 1}: ${chapter.title}\n\n${chapter.content}` : '').filter(Boolean).join('\n\n')} />
  ) : null;

  // Rendering only: the docx/pdf/markdown writers read this shape. Nothing is stored from it —
  // the book itself already lives in its slot (data/<id>/snapshot.json), written by the store
  // on every mutation, so there is no separate "save to the shelf" step to perform.
  const exportAsProject = React.useMemo(
    () => chaptersToStudioProject(
      storyPremise.slice(0, 80) || 'Untitled Book',
      storyPremise,
      storySettings.genre ?? '',
      language,
      generatedChapters,
    ),
    [storyPremise, storySettings.genre, language, generatedChapters],
  );
  const hasDraftContent = generatedChapters.some(chapter => chapter.content.trim());

  const goToDashboard = () => navigate('/');

  // The side panels on the generation page read the live store, so they show the memory the
  // run is actually writing against. memoryRevision is what tells them an edit landed.
  const codexView = React.useMemo(
    () => (storeReady ? readCodexView() : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storeReady, memoryRevision, currentChapterProcessing, generatedChapters.length],
  );
  const authorRequests = React.useMemo(
    () => (storeReady ? listAuthorRequests() : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storeReady, memoryRevision, currentChapterProcessing],
  );
  const [cover, setCover] = React.useState<{ url?: string; history: { id: string; url: string; prompt: string; createdAt: string }[] }>({ history: [] });

  const workInProgressActions = (
    <>
      <button
        type="button"
        onClick={() => setShowExportAs(true)}
        disabled={!hasDraftContent}
        className="h-7 text-xs px-3 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-300 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {t('wizard.app.exportAs')}
      </button>
    </>
  );

  // Always visible, generating or not — this is the one place keys/usage/language live, so it
  // must not disappear behind the compact full-bleed generation layout (isStudioLayout).
  const alwaysVisibleControls = (
    <div className={`w-full ${isStudioLayout ? 'max-w-[1920px]' : 'max-w-4xl'} px-4 md:px-8 pt-2 flex flex-wrap items-center justify-between gap-3 transition-all duration-300`}>
      <div className="flex items-baseline gap-2">
        <button type="button" onClick={goToDashboard} className="text-zinc-500 hover:text-zinc-300 text-sm mr-1">
          {t('wizard.app.backToDashboard')}
        </button>
        <h1 className="text-2xl font-semibold wordmark">
          NovelGenerator
        </h1>
        <span className="font-mono text-xs text-zinc-500">v4.2</span>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setShowStats(true)}
          title={t('usage.title')}
          className="h-7 text-xs px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-300 rounded transition-colors"
        >
          📊
        </button>
        <ThemeToggle />
        <SystemManualToggle />
        <button
          type="button"
          onClick={() => setShowKeys(true)}
          className="h-7 text-xs px-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-300 rounded transition-colors"
        >
          🔑
        </button>
        <LanguageSelector />
      </div>
    </div>
  );

  return (
    <div className={`w-full bg-zinc-950 text-zinc-300 flex flex-col items-center selection:bg-zinc-700 selection:text-white ${isStudioLayout ? 'h-screen max-h-screen overflow-hidden p-2 md:p-3' : 'min-h-screen p-4 md:p-8'}`}>
      {alwaysVisibleControls}
      {!isStudioLayout && (
      <header className="w-full max-w-4xl mb-6 px-4 md:px-8 transition-all duration-300">
        {/* Actions on the current project, and token/usage info. */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1.5">
          <div className="flex items-center gap-3">
          {saveControl}
          {workInProgressActions}

          <details className="relative">
            <summary
              title={t('wizard.app.moreActions')}
              className="h-7 w-7 flex items-center justify-center list-none cursor-pointer bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-300 rounded transition-colors [&::-webkit-details-marker]:hidden"
            >
              ⋮
            </summary>
            <div className="absolute left-0 mt-1 flex flex-col gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 z-20 w-48">
              <button
                type="button"
                onClick={exportProject}
                title={t('wizard.app.exportProjectTitle')}
                className="text-left text-xs px-3 py-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300 rounded transition-colors"
              >
                {t('wizard.app.exportProject')}
              </button>
              <label
                title={t('wizard.app.importProjectTitle')}
                className="text-left text-xs px-3 py-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300 rounded transition-colors cursor-pointer"
              >
                {t('wizard.app.importProject')}
                <input type="file" accept=".json,application/json" className="hidden" onChange={event => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) importProject(file).catch(err => alert(t('wizard.app.importFailedAlert', { message: err instanceof Error ? err.message : String(err) })));
                }} />
              </label>
              <button
                type="button"
                onClick={handleReset}
                title={t('wizard.app.cleanSlateTitle')}
                className="text-left text-xs px-3 py-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300 rounded transition-colors"
              >
                {t('wizard.app.cleanSlate')}
              </button>
            </div>
          </details>
          </div>
        </div>
        <p className="text-zinc-500 text-xs  text-left">
          {t('wizard.app.tagline')}
        </p>
      </header>
      )}

      <main className={`w-full ${isStudioLayout ? 'max-w-[1920px] flex-1 min-h-0 flex flex-col p-3 md:p-4 overflow-hidden' : 'max-w-4xl p-4 md:p-8'} animate-fade-in transition-all duration-300`}>
        {error && (
          <div className="mb-4 p-4 bg-red-950/40 border border-red-900/60 text-red-300 rounded text-sm">
            <p className="font-semibold mb-1">{t('wizard.app.errorLabel')}</p>
            <p className="whitespace-pre-wrap">{splitError(error).headline}</p>
            {splitError(error).detail && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-red-300/80 hover:text-red-200">{t('wizard.app.reviewDetailsSummary')}</summary>
                <p className="mt-2 whitespace-pre-wrap text-xs text-red-300/90 max-h-64 overflow-y-auto">{splitError(error).detail}</p>
              </details>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button onClick={handleContinue} disabled={isLoading} className="underline">{t('wizard.app.continueButton')}</button>
              {/* A refused design is usually fixed by changing the premise or the
                  editor model. Without this, reaching the form again costs the
                  author everything they typed. */}
              <button
                onClick={editSettings}
                disabled={isLoading}
                className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded text-xs transition-colors"
              >
                {t('wizard.app.changeSettingsButton')}
              </button>
              <button
                onClick={handleReset}
                className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded text-xs transition-colors"
              >
                {t('wizard.app.startNewBookButton')}
              </button>
            </div>
          </div>
        )}

        {view === 'opening' && (
          <p className="text-zinc-500 text-xs">{t('wizard.app.openingStorage')}</p>
        )}

        {view === 'form' && (
          <>
            <UserInput
              storyPremise={storyPremise}
              setStoryPremise={setStoryPremise}
              numChapters={numChapters}
              setNumChapters={setNumChapters}
              genre={storySettings.genre || 'romance'}
              setGenre={(genre) => setStorySettings({ ...storySettings, genre })}
              storySettings={storySettings}
              setStorySettings={setStorySettings}
              onSubmit={handleStartGeneration}
              isLoading={isLoading}
            />

          </>
        )}
        
        {view === 'designing' && (
          <div className="text-center py-12">
            <LoadingSpinner />
            <p className="mt-4 text-zinc-300 text-sm font-medium">{t('wizard.app.designingBook')}</p>
            <p className="mt-1 text-zinc-500 text-xs">{t('wizard.app.designingBookDetail')}</p>
            {/* The longest single wait in a run, and the one with no chapter
                view to show progress in. Without a clock it reads as hung. */}
            <p className="mt-3 text-xs"><RunClock agentLogs={agentLogs} isLoading={isLoading} /></p>
          </div>
        )}


        {showProgress && (
          <ThreeZoneGenerationView
            currentStep={currentStep}
            currentChapterProcessing={currentChapterProcessing}
            totalChaptersToProcess={totalChaptersToProcess}
            currentStoryOutline={currentStoryOutline}
            currentChapterPlan={currentChapterPlan}
            generatedChapters={generatedChapters}
            agentLogs={agentLogs}
            lastSavedAt={lastSavedAt}
            isResumable={isResumable}
            isLoading={isLoading}
            onResumeGeneration={handleStartGeneration}
            onPauseGeneration={pauseGeneration}
            codexPanel={codexView ? <CodexPanel codex={codexView} onEdit={editCodex} /> : null}
            coverPanel={
              <CoverPanel
                title={storyPremise.slice(0, 60) || 'Untitled'}
                synopsis={storyPremise}
                genre={storySettings.genre ?? ''}
                currentCover={cover.url}
                history={cover.history}
                onChange={(url, history) => setCover({ url, history })}
              />
            }
            requestPanel={
              <AuthorRequestPanel
                requests={authorRequests}
                chapterCount={totalChaptersToProcess}
                onQueue={(kind, text, chapter) => addAuthorRequest(kind, text, chapter)}
              />
            }
            headerActions={<>{saveControl}{workInProgressActions}</>}
            version="v4.2"
            onReset={handleReset}
          />
        )}


        {view === 'finished' && finalMetadataJson && (
          <>
            <BookDisplay
              bookContent={finalBookContent}
              metadataJson={finalMetadataJson}
              onReset={handleReset}
            />

            {/* Show agent logs after completion too */}
            {agentLogs.length > 0 && (
              <AgentActivityLog logs={agentLogs} />
            )}
          </>
        )}

      </main>
      <footer className={`w-full ${isStudioLayout ? 'max-w-[1920px] mt-1 shrink-0 py-0.5' : 'max-w-4xl mt-8'} transition-all duration-300`}>
        <div className="text-center text-zinc-500 text-xs">
          <p>
            &copy; {new Date().getFullYear()}{' '}
            <a 
              href="https://github.com/KazKozDev" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-zinc-400 hover:text-zinc-300 transition-colors duration-200 underline decoration-dotted"
            >
              KazKozDev
            </a>
          </p>
        </div>
      </footer>

      {showKeys && <ApiKeyManagerModal onClose={() => setShowKeys(false)} />}
      {showStats && <UsageStatsModal onClose={() => setShowStats(false)} />}
      {showExportAs && <ExportAsModal project={exportAsProject} onClose={() => setShowExportAs(false)} />}
    </div>
  );
};

export default App;
