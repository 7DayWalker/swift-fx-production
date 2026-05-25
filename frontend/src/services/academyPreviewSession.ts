/**
 * academyPreviewSession — in-memory, session-only preview unlocks for academy gating.
 *
 * Requirements:
 * - in-memory only
 * - no persistence (no AsyncStorage, no backend writes)
 * - resets naturally on app restart/process death
 */

const unlockedCategories = new Set<string>();

function normalizeCategory(category: string): string {
  return (category || '').toLowerCase().trim();
}

/** Mark a category as unlocked for the current app process session. */
export function unlockCategory(category: string): void {
  const key = normalizeCategory(category);
  if (!key) return;
  unlockedCategories.add(key);
}

/** Returns true if the category is unlocked in the current app process session. */
export function isCategoryUnlocked(category: string): boolean {
  const key = normalizeCategory(category);
  if (!key) return false;
  return unlockedCategories.has(key);
}

/** Clear all unlocked categories for the current app process session. */
export function clearUnlocks(): void {
  unlockedCategories.clear();
}
