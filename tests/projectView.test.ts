import { describe, it, expect } from 'vitest';
import { decideProjectView, type ProjectViewInput } from '../utils/projectView';
import { GenerationStep } from '../types';

const base: ProjectViewInput = {
  isCreating: false,
  storeReady: true,
  isLoading: false,
  currentStep: GenerationStep.Idle,
  hasStoredWork: false,
  hasFinalBook: false,
};

describe('which screen a project route shows', () => {
  it('never leaves a reachable state without a screen', () => {
    // The blank page was exactly this: a combination that matched no branch.
    for (const isCreating of [true, false]) {
      for (const storeReady of [true, false]) {
        for (const isLoading of [true, false]) {
          for (const hasStoredWork of [true, false]) {
            for (const hasFinalBook of [true, false]) {
              for (const currentStep of Object.values(GenerationStep)) {
                const view = decideProjectView({ isCreating, storeReady, isLoading, currentStep, hasStoredWork, hasFinalBook });
                expect(view).toBeTruthy();
              }
            }
          }
        }
      }
    }
  });

  it('shows the book’s page for a slot that has work, even when nothing is running', () => {
    expect(decideProjectView({ ...base, hasStoredWork: true })).toBe('progress');
  });

  it('shows the book’s page the moment a run starts, before anything is written', () => {
    expect(decideProjectView({ ...base, isLoading: true })).toBe('progress');
  });

  it('shows the form for a slot that exists but has nothing written yet', () => {
    // A book whose first call failed must not open on an empty page.
    expect(decideProjectView(base)).toBe('form');
  });

  it('shows the form on the creation route', () => {
    expect(decideProjectView({ ...base, isCreating: true })).toBe('form');
  });

  it('shows the design spinner while the book is being designed', () => {
    expect(decideProjectView({ ...base, isLoading: true, currentStep: GenerationStep.GeneratingOutline })).toBe('designing');
  });

  it('waits on storage before deciding anything else', () => {
    expect(decideProjectView({ ...base, storeReady: false, hasStoredWork: true })).toBe('opening');
  });

  it('shows the finished book once there is one', () => {
    expect(decideProjectView({ ...base, hasFinalBook: true, hasStoredWork: true })).toBe('finished');
  });

  it('keeps an errored run on the book’s page, with the chapters it did write', () => {
    expect(decideProjectView({ ...base, currentStep: GenerationStep.Error, hasStoredWork: true })).toBe('progress');
  });
});
