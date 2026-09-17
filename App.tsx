


import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from './i18n';
import useBookGenerator, { splitError } from './hooks/useBookGenerator';
import { RunClock } from './components/RunClock';
import { GenerationStep } from './types';
import UserInput from './components/UserInput';
import ThemeToggle from './components/ThemeToggle';
import SystemManualToggle from './components/SystemManualModal';
import BookDisplay from './components/BookDisplay';
import SaveBook from './components/SaveBook';
import { LoadingSpinner } from './components/common/LoadingSpinner';

import AgentActivityLog from './components/AgentActivityLog';
import ThreeZoneGenerationView from './components/ThreeZoneGenerationView';
import { installConsoleBridge, logToTerminal, watchMainThreadStalls } from './utils/terminalLogger';
import SaveToBookshelf from './components/dashboard/SaveToBookshelf';
import LanguageSelector from './components/common/LanguageSelector';
import ApiKeyManagerModal from './components/common/ApiKeyManagerModal';
import UsageWidget from './components/usage/UsageWidget';
import ExportAsModal from './components/common/ExportAsModal';
import SaveBeforeLeaveModal from './components/common/SaveBeforeLeaveModal';
import { chaptersToStudioProject } from './services/importFromGenerator';
import { saveProjectFull } from './services/studioStore';
import { indexProject } from './lib/rag';

const App: React.FC = () => {
  const navigate = useNavigate();
  const { t, language } = useI18n();
  const [showKeys, setShowKeys] = React.useState(false);
  const [showExportAs, setShowExportAs] = React.useState(false);
  const [showLeaveModal, setShowLeaveModal] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [savedProjectId, setSavedProjectId] = React.useState<string | null>(null);
  const savedProjectIdRef = React.useRef<string | null>(null);
  const {
    storyPremise,
    setStoryPremise,
    numChapters,
    setNumChapters,
    storySettings,
    setStorySettings,
    startGeneration,
    continueGeneration,
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
  } = useBookGenerator();

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
    if (storyPremise && numChapters >= 3) {
      startGeneration(storyPremise, numChapters);
    } else {
      // Basic validation feedback, can be improved
      alert(t('wizard.app.validationAlert'));
    }
  };

  const handleContinue = () => {
    continueGeneration();
  };

  const handleReset = () => {
    resetGenerator();
  };

  const showProgress = (isLoading || isResumable) && 
                       currentStep !== GenerationStep.Idle && 
                       currentStep !== GenerationStep.Done &&
                       currentStep !== GenerationStep.Error &&
                       currentStep !== GenerationStep.WaitingForOutlineApproval &&
                       currentStep !== GenerationStep.GeneratingOutline;

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

  // For "Export as…" (docx/pdf/json/markdown): built on the fly from the current draft, not
  // persisted — Save (SaveToBookshelf) is the separate action that writes it to data/<id>/.
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

  // Shared between the header's Save button and the "save before leaving" prompt: creates the
  // Studio project on first call and updates the same one (by id) on every call after.
  const performSave = React.useCallback(async () => {
    if (!hasDraftContent) return;
    setSaving(true);
    try {
      const project = chaptersToStudioProject(
        storyPremise.slice(0, 80) || 'Untitled Book',
        storyPremise,
        storySettings.genre ?? '',
        language,
        generatedChapters,
      );
      if (savedProjectIdRef.current) project.id = savedProjectIdRef.current;
      savedProjectIdRef.current = project.id;
      await saveProjectFull(project);
      void indexProject(project);
      setSavedProjectId(project.id);
    } finally {
      setSaving(false);
    }
  }, [hasDraftContent, storyPremise, storySettings.genre, language, generatedChapters]);

  const goToDashboard = () => {
    if (hasDraftContent) setShowLeaveModal(true);
    else navigate('/');
  };

  const workInProgressActions = (
    <>
      <SaveToBookshelf saving={saving} savedProjectId={savedProjectId} hasContent={hasDraftContent} onSave={() => void performSave()} />
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

  return (
    <div className={`w-full bg-zinc-950 text-zinc-300 flex flex-col items-center selection:bg-zinc-700 selection:text-white ${isStudioLayout ? 'h-screen max-h-screen overflow-hidden p-2 md:p-3' : 'min-h-screen p-4 md:p-8'}`}>
      {!isStudioLayout && (
      <header className="w-full max-w-4xl mb-6 px-4 md:px-8 transition-all duration-300">
        {/* Row 1: branding, then app-level controls (theme, help, keys, language). */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
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

        {/* Row 2: actions on the current project, and token/usage info. */}
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

          <div className="hidden lg:block">
            <UsageWidget />
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

        {currentStep === GenerationStep.Idle && !finalBookContent && isResumable && (
          <div className="border border-zinc-800 rounded p-4 md:p-5 text-sm text-zinc-300">
            <p className="font-medium">{t('wizard.app.unfinishedFound', { count: generatedChapters.length, total: totalChaptersToProcess })}</p>
            <p className="text-xs text-zinc-500 mt-1">{t('wizard.app.unfinishedNote')}</p>
            <div className="mt-3 flex gap-3">
              <button onClick={handleContinue} disabled={isLoading} className="px-3 py-1 bg-zinc-200 text-zinc-900 rounded text-xs font-medium">{t('wizard.app.continueWriting')}</button>
              <button onClick={handleReset} className="px-3 py-1 border border-zinc-700 rounded text-xs">{t('wizard.app.discardStartNew')}</button>
            </div>
          </div>
        )}

        {currentStep === GenerationStep.Idle && !finalBookContent && !storeReady && (
          <p className="text-zinc-500 text-xs">{t('wizard.app.openingStorage')}</p>
        )}

        {currentStep === GenerationStep.Idle && !finalBookContent && !isResumable && storeReady && (
          <>
            <UserInput
              storyPremise={storyPremise}
              setStoryPremise={setStoryPremise}
              numChapters={numChapters}
              setNumChapters={setNumChapters}
              genre={storySettings.genre || 'fantasy'}
              setGenre={(genre) => setStorySettings({ ...storySettings, genre })}
              storySettings={storySettings}
              setStorySettings={setStorySettings}
              onSubmit={handleStartGeneration}
              isLoading={isLoading}
            />

          </>
        )}
        
        {currentStep === GenerationStep.GeneratingOutline && (
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
            headerActions={<>{saveControl}{workInProgressActions}</>}
            version="v4.2"
            onReset={handleReset}
          />
        )}


        {finalBookContent && finalMetadataJson && (
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
      {showExportAs && <ExportAsModal project={exportAsProject} onClose={() => setShowExportAs(false)} />}
      {showLeaveModal && (
        <SaveBeforeLeaveModal
          saving={saving}
          onCancel={() => setShowLeaveModal(false)}
          onLeaveWithoutSaving={() => { setShowLeaveModal(false); navigate('/'); }}
          onSaveAndLeave={() => {
            void performSave().then(() => { setShowLeaveModal(false); navigate('/'); });
          }}
        />
      )}
    </div>
  );
};

export default App;
