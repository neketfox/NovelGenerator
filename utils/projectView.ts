import { GenerationStep } from '../types';

export interface ProjectViewInput {
  /** /project/new has no slot yet; /project/:id does. */
  isCreating: boolean;
  storeReady: boolean;
  isLoading: boolean;
  currentStep: GenerationStep;
  /** The slot holds a design or written chapters. */
  hasStoredWork: boolean;
  hasFinalBook: boolean;
}

export type ProjectView = 'opening' | 'form' | 'designing' | 'progress' | 'finished';

/**
 * Which screen a project route shows. Extracted from the page because the rule that matters is
 * easy to get wrong: every reachable combination must name a screen. An earlier version left a
 * hole — a slot with nothing written yet, with no run in flight, matched no branch at all and
 * rendered a page with nothing on it but the header.
 */
export function decideProjectView(input: ProjectViewInput): ProjectView {
  if (input.hasFinalBook) return 'finished';
  if (!input.storeReady) return 'opening';
  if (input.currentStep === GenerationStep.GeneratingOutline) return 'designing';

  // A book with something in it — running, paused, or waiting to be resumed — belongs on its
  // own page. This is also where a finished-but-unpublished run and an error land, so the
  // author sees the chapters that exist rather than an empty form.
  if (!input.isCreating && (input.isLoading || input.hasStoredWork)) return 'progress';

  // Nothing written yet: the form, whether this is a brand new book or a slot that was created
  // and never got past its first call. It opens pre-filled from the slot's own input.
  return 'form';
}
