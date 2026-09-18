import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThreeZoneGenerationView } from '../components/ThreeZoneGenerationView';
import { I18nProvider } from '../i18n';
import { GenerationStep } from '../types';

function render(props: Partial<React.ComponentProps<typeof ThreeZoneGenerationView>> = {}) {
  return renderToStaticMarkup(
    <I18nProvider>
      <ThreeZoneGenerationView
        currentStep={GenerationStep.GeneratingChapters}
        currentChapterProcessing={1}
        totalChaptersToProcess={3}
        currentStoryOutline="Central conflict: a closed border."
        currentChapterPlan="{}"
        generatedChapters={[{ title: 'Chapter 1', content: 'The guard did not look up.' }]}
        agentLogs={[]}
        {...props}
      />
    </I18nProvider>,
  );
}

describe('pause and resume on the generation page', () => {
  it('offers Pause while a run is in flight', () => {
    const html = render({ isLoading: true, onPauseGeneration: () => {} });
    expect(html).toContain('Pause');
  });

  it('offers Resume instead of Pause once the run has stopped', () => {
    const html = render({
      isLoading: false,
      isResumable: true,
      onPauseGeneration: () => {},
      onResumeGeneration: () => {},
    });
    expect(html).toContain('Resume Generation');
    // Pause belongs to a run in flight; a stopped book is resumed, never paused again.
    expect(html).not.toContain('>Pause<');
  });

  it('shows neither control when there is nothing to pause or resume', () => {
    const html = render({ isLoading: false, isResumable: false });
    expect(html).not.toContain('>Pause<');
    expect(html).not.toContain('Resume Generation');
  });

  it('does not offer Pause when no pause handler is wired', () => {
    const html = render({ isLoading: true });
    expect(html).not.toContain('>Pause<');
  });
});
