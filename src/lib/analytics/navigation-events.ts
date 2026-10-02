type NavigationEvents = { location: string; seen: Set<string> };
const navigation = new WeakMap<Window, NavigationEvents>();

/** Sólo memoria de la pestaña; no identifica personas ni se guarda en almacenamiento. */
export function beginAnalyticsNavigation(): void {
  if (typeof window === 'undefined') return;
  const location = window.location.href;
  if (navigation.get(window)?.location !== location) navigation.set(window, { location, seen: new Set() });
}

export function firstEventInNavigation(key: string): boolean {
  if (typeof window === 'undefined') return false;
  beginAnalyticsNavigation();
  const current = navigation.get(window)!;
  if (current.seen.has(key)) return false;
  current.seen.add(key);
  return true;
}
