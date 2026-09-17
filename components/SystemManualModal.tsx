import React, { useState, useEffect } from 'react';
import { useI18n } from '../i18n';

interface SystemManualModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SystemManualModal({ isOpen, onClose }: SystemManualModalProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'pipeline' | 'models' | 'canon' | 'memory'>('pipeline');

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-zinc-900 light:bg-white border border-zinc-800 light:border-zinc-200 rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 light:border-zinc-200 bg-zinc-950/60 light:bg-zinc-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-zinc-800 light:bg-zinc-100 border border-zinc-700 light:border-zinc-300 text-zinc-300 light:text-zinc-800">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100 light:text-zinc-900">
                {t('wizard.systemManual.title')}
              </h2>
              <p className="text-xs text-zinc-400 light:text-zinc-500">
                {t('wizard.systemManual.subtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 light:text-zinc-500 light:hover:text-zinc-800 hover:bg-zinc-800 light:hover:bg-zinc-200 rounded-md transition-colors"
            title={t('wizard.systemManual.closeTitle')}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-5 pt-3 pb-2 border-b border-zinc-800/80 light:border-zinc-200 bg-zinc-950/30 light:bg-zinc-100/50 shrink-0 text-xs overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('pipeline')}
            className={`px-3 py-1.5 rounded-md font-medium transition-all ${
              activeTab === 'pipeline'
                ? 'bg-zinc-800 light:bg-white text-zinc-100 light:text-zinc-900 shadow-sm'
                : 'text-zinc-400 light:text-zinc-600 hover:text-zinc-200 light:hover:text-zinc-900 hover:bg-zinc-800/50'
            }`}
          >
            {t('wizard.systemManual.tabPipeline')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('models')}
            className={`px-3 py-1.5 rounded-md font-medium transition-all ${
              activeTab === 'models'
                ? 'bg-zinc-800 light:bg-white text-zinc-100 light:text-zinc-900 shadow-sm'
                : 'text-zinc-400 light:text-zinc-600 hover:text-zinc-200 light:hover:text-zinc-900 hover:bg-zinc-800/50'
            }`}
          >
            {t('wizard.systemManual.tabModels')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('canon')}
            className={`px-3 py-1.5 rounded-md font-medium transition-all ${
              activeTab === 'canon'
                ? 'bg-zinc-800 light:bg-white text-zinc-100 light:text-zinc-900 shadow-sm'
                : 'text-zinc-400 light:text-zinc-600 hover:text-zinc-200 light:hover:text-zinc-900 hover:bg-zinc-800/50'
            }`}
          >
            {t('wizard.systemManual.tabCanon')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('memory')}
            className={`px-3 py-1.5 rounded-md font-medium transition-all ${
              activeTab === 'memory'
                ? 'bg-zinc-800 light:bg-white text-zinc-100 light:text-zinc-900 shadow-sm'
                : 'text-zinc-400 light:text-zinc-600 hover:text-zinc-200 light:hover:text-zinc-900 hover:bg-zinc-800/50'
            }`}
          >
            {t('wizard.systemManual.tabMemory')}
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm leading-relaxed text-zinc-300 light:text-zinc-800">
          {activeTab === 'pipeline' && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-zinc-100 light:text-zinc-900">
                {t('wizard.systemManual.pipelineHeading')}
              </h3>
              <p className="text-xs text-zinc-400 light:text-zinc-600">
                {t('wizard.systemManual.pipelineIntro')}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="flex items-center gap-2 font-medium text-zinc-300 light:text-zinc-800 text-xs uppercase tracking-wide mb-1.5">
                    <span className="w-5 h-5 rounded-full bg-zinc-800 light:bg-zinc-200 flex items-center justify-center text-[10px] text-zinc-200 light:text-zinc-800">1</span>
                    {t('wizard.systemManual.step1Title')}
                  </div>
                  <p className="text-xs text-zinc-400 light:text-zinc-600">
                    {t('wizard.systemManual.step1Body')}
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="flex items-center gap-2 font-medium text-zinc-300 light:text-zinc-800 text-xs uppercase tracking-wide mb-1.5">
                    <span className="w-5 h-5 rounded-full bg-zinc-800 light:bg-zinc-200 flex items-center justify-center text-[10px] text-zinc-200 light:text-zinc-800">2</span>
                    {t('wizard.systemManual.step2Title')}
                  </div>
                  <p className="text-xs text-zinc-400 light:text-zinc-600">
                    {t('wizard.systemManual.step2Body')}
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="flex items-center gap-2 font-medium text-zinc-300 light:text-zinc-800 text-xs uppercase tracking-wide mb-1.5">
                    <span className="w-5 h-5 rounded-full bg-zinc-800 light:bg-zinc-200 flex items-center justify-center text-[10px] text-zinc-200 light:text-zinc-800">3</span>
                    {t('wizard.systemManual.step3Title')}
                  </div>
                  <p className="text-xs text-zinc-400 light:text-zinc-600">
                    {t('wizard.systemManual.step3Body')}
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="flex items-center gap-2 font-medium text-zinc-300 light:text-zinc-800 text-xs uppercase tracking-wide mb-1.5">
                    <span className="w-5 h-5 rounded-full bg-zinc-800 light:bg-zinc-200 flex items-center justify-center text-[10px] text-zinc-200 light:text-zinc-800">4</span>
                    {t('wizard.systemManual.step4Title')}
                  </div>
                  <p className="text-xs text-zinc-400 light:text-zinc-600">
                    {t('wizard.systemManual.step4Body')}
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="flex items-center gap-2 font-medium text-zinc-300 light:text-zinc-800 text-xs uppercase tracking-wide mb-1.5">
                    <span className="w-5 h-5 rounded-full bg-zinc-800 light:bg-zinc-200 flex items-center justify-center text-[10px] text-zinc-200 light:text-zinc-800">5</span>
                    {t('wizard.systemManual.step5Title')}
                  </div>
                  <p className="text-xs text-zinc-400 light:text-zinc-600">
                    {t('wizard.systemManual.step5Body')}
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="flex items-center gap-2 font-medium text-zinc-300 light:text-zinc-800 text-xs uppercase tracking-wide mb-1.5">
                    <span className="w-5 h-5 rounded-full bg-zinc-800 light:bg-zinc-200 flex items-center justify-center text-[10px] text-zinc-200 light:text-zinc-800">6</span>
                    {t('wizard.systemManual.step6Title')}
                  </div>
                  <p className="text-xs text-zinc-400 light:text-zinc-600">
                    {t('wizard.systemManual.step6Body')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'models' && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-zinc-100 light:text-zinc-900">
                {t('wizard.systemManual.modelsHeading')}
              </h3>
              <p className="text-xs text-zinc-400 light:text-zinc-600">
                {t('wizard.systemManual.modelsIntro')}
              </p>

              {/* Cloud/Local LLM */}
              <div className="p-4 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/50 light:bg-zinc-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm text-zinc-200 light:text-zinc-900">
                    {t('wizard.systemManual.llmTitle')}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-800 light:bg-zinc-100 border border-zinc-700 light:border-zinc-300 text-zinc-300 light:text-zinc-800">
                    {t('wizard.systemManual.llmBadge')}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 light:text-zinc-600">
                  {t('wizard.systemManual.llmBody')}
                </p>
              </div>

              {/* Local Models Table */}
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase text-zinc-500 tracking-wider">
                  {t('wizard.systemManual.localModelsHeading')}
                </div>

                <div className="border border-zinc-800 light:border-zinc-200 rounded-lg overflow-hidden divide-y divide-zinc-800 light:divide-zinc-200 text-xs">
                  <div className="p-3 bg-zinc-950/40 light:bg-zinc-50 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-zinc-200 light:text-zinc-900">
                        {t('wizard.systemManual.crossEncoderTitle')}
                      </div>
                      <div className="text-zinc-500 font-mono text-[11px]">onnx-community/bge-reranker-v2-m3-ONNX · ~544 MB</div>
                      <p className="text-zinc-400 light:text-zinc-600 mt-1">
                        {t('wizard.systemManual.crossEncoderBody')}
                      </p>
                    </div>
                    <span className="shrink-0 px-2 py-0.5 rounded text-[10px] bg-zinc-800 light:bg-zinc-100 text-zinc-300 light:text-zinc-800 border border-zinc-700 light:border-zinc-300">
                      {t('wizard.systemManual.alwaysOn')}
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-950/40 light:bg-zinc-50 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-zinc-200 light:text-zinc-900">
                        {t('wizard.systemManual.nliTitle')}
                      </div>
                      <div className="text-zinc-500 font-mono text-[11px]">Xenova/nli-deberta-v3-base · ~233 MB</div>
                      <p className="text-zinc-400 light:text-zinc-600 mt-1">
                        {t('wizard.systemManual.nliBody')}
                      </p>
                    </div>
                    <span className="shrink-0 px-2 py-0.5 rounded text-[10px] bg-zinc-800 light:bg-zinc-100 text-zinc-300 light:text-zinc-800 border border-zinc-700 light:border-zinc-300">
                      {t('wizard.systemManual.alwaysOn')}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-zinc-500 light:text-zinc-600">
                  {t('wizard.systemManual.noSettingNote')}
                </p>

                <p className="text-xs text-zinc-500 light:text-zinc-600">
                  {t('wizard.systemManual.weightsLoading')}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'canon' && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-zinc-100 light:text-zinc-900">
                {t('wizard.systemManual.canonHeading')}
              </h3>
              <p className="text-xs text-zinc-400 light:text-zinc-600">
                {t('wizard.systemManual.canonIntro')}
              </p>

              <div className="space-y-3">
                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="font-medium text-zinc-200 light:text-zinc-900 text-xs mb-1">
                    {t('wizard.systemManual.whatIsTitle')}
                  </div>
                  <ul className="list-disc list-inside text-xs text-zinc-400 light:text-zinc-600 space-y-1">
                    <li><strong className="text-zinc-300 light:text-zinc-800">{t('wizard.systemManual.canonFactsLabel')}</strong> {t('wizard.systemManual.canonFactsDesc')}</li>
                    <li><strong className="text-zinc-300 light:text-zinc-800">{t('wizard.systemManual.storyEventsLabel')}</strong> {t('wizard.systemManual.storyEventsDesc')}</li>
                    <li><strong className="text-zinc-300 light:text-zinc-800">{t('wizard.systemManual.plotPromisesLabel')}</strong> {t('wizard.systemManual.plotPromisesDesc')}</li>
                    <li><strong className="text-zinc-300 light:text-zinc-800">{t('wizard.systemManual.nameRegistryLabel')}</strong> {t('wizard.systemManual.nameRegistryDesc')}</li>
                    <li><strong className="text-zinc-300 light:text-zinc-800">{t('wizard.systemManual.premiseGivensLabel')}</strong> {t('wizard.systemManual.premiseGivensDesc')}</li>
                    <li><strong className="text-zinc-300 light:text-zinc-800">{t('wizard.systemManual.kineticRuleLabel')}</strong> {t('wizard.systemManual.kineticRuleDesc')}</li>
                  </ul>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="font-medium text-zinc-300 light:text-zinc-800 text-xs mb-1">
                    {t('wizard.systemManual.neverRewrittenTitle')}
                  </div>
                  <p className="text-xs text-zinc-400 light:text-zinc-600 leading-relaxed">
                    {t('wizard.systemManual.neverRewrittenBody1')}
                  </p>
                  <p className="text-xs text-zinc-400 light:text-zinc-600 leading-relaxed mt-2">
                    {t('wizard.systemManual.neverRewrittenBody2')}
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="font-medium text-zinc-300 light:text-zinc-800 text-xs mb-1">
                    {t('wizard.systemManual.budgetsTitle')}
                  </div>
                  <p className="text-xs text-zinc-400 light:text-zinc-600 leading-relaxed">
                    {t('wizard.systemManual.budgetsBody1')}
                  </p>
                  <p className="text-xs text-zinc-400 light:text-zinc-600 leading-relaxed mt-2">
                    {t('wizard.systemManual.budgetsBody2')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'memory' && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-zinc-100 light:text-zinc-900">
                {t('wizard.systemManual.memoryHeading')}
              </h3>
              <p className="text-xs text-zinc-400 light:text-zinc-600">
                {t('wizard.systemManual.memoryIntro')}
              </p>

              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="font-medium text-zinc-300 light:text-zinc-800 mb-1">
                    {t('wizard.systemManual.idleUnloadTitle')}
                  </div>
                  <p className="text-zinc-400 light:text-zinc-600">
                    {t('wizard.systemManual.idleUnloadBody')}
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="font-medium text-zinc-300 light:text-zinc-800 mb-1">
                    {t('wizard.systemManual.weightCachingTitle')}
                  </div>
                  <p className="text-zinc-400 light:text-zinc-600">
                    {t('wizard.systemManual.weightCachingBody')}
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="font-medium text-zinc-300 light:text-zinc-800 mb-1">
                    {t('wizard.systemManual.decayTitle')}
                  </div>
                  <p className="text-zinc-400 light:text-zinc-600">
                    {t('wizard.systemManual.decayBody')}
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="font-medium text-zinc-300 light:text-zinc-800 mb-1">
                    {t('wizard.systemManual.persistenceTitle')}
                  </div>
                  <p className="text-zinc-400 light:text-zinc-600">
                    {t('wizard.systemManual.persistenceBody')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-zinc-800 light:border-zinc-200 bg-zinc-950/60 light:bg-zinc-50 shrink-0 text-xs text-zinc-500">
          <span>{t('wizard.systemManual.footerTagline')}</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 light:bg-zinc-200 light:hover:bg-zinc-300 text-zinc-200 light:text-zinc-800 rounded-md font-medium transition-colors"
          >
            {t('wizard.systemManual.gotIt')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The button component placed next to ThemeToggle */
export function SystemManualToggle({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title={t('wizard.systemManual.toggleTitle')}
        aria-label={t('wizard.systemManual.toggleAriaLabel')}
        className={`inline-flex items-center justify-center w-7 h-7 rounded-md border transition-all duration-200 text-zinc-400 hover:text-zinc-200 light:text-zinc-500 light:hover:text-zinc-900 border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 hover:border-zinc-700 light:border-zinc-300 light:border-zinc-200/80 light:bg-white light:hover:bg-zinc-100 shadow-sm ${className}`}
      >
        {/* The ring is gone, so the mark carries the button on its own: drawn against the glyph's
            bounds rather than the circle's, it fills the frame the circle used to occupy. */}
        <svg
          className="w-4 h-4 transition-transform duration-200 hover:scale-110"
          viewBox="7 4 10 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </button>
      <SystemManualModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}

export default SystemManualToggle;
