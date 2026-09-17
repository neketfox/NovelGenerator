/**
 * The user's UI preset (language, theme): data/user/preferences.json, written by
 * services/userPreferencesServer.ts. Local pet project run only via `npm run dev` — no
 * localStorage. The one synchronous read this can't replace is the pre-paint theme script in
 * index.html, which uses a synchronous XHR against the same endpoint (see there) so the page
 * never flashes the wrong theme before React mounts.
 */
export interface UserPreferences {
  language?: string;
  theme?: 'light' | 'dark' | 'autumn';
}

export async function loadPreferences(): Promise<UserPreferences> {
  try {
    const res = await fetch('/api/preferences');
    if (res.ok) return (await res.json()) as UserPreferences;
  } catch {
    // dev server not reachable — caller keeps whatever default it already rendered with
  }
  return {};
}

export async function savePreferences(patch: UserPreferences): Promise<void> {
  await fetch('/api/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }).catch(() => undefined);
}
