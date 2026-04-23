export function isStableRuntimeMode(): boolean {
  return (
    process.env.DISABLE_LIVE_SCRAPING === '1'
    || process.env.E2E_STABLE_MODE === '1'
    || process.env.CI_E2E === '1'
  );
}

export function shouldSkipLiveScraping(): boolean {
  return isStableRuntimeMode();
}
