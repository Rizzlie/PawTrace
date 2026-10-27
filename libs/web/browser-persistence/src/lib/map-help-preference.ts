/** Browser-only preference; independent of case snapshots and JSON export. */
const mapHelpSeenKey = 'pawtrace.map-help.seen.v1';

export function hasSeenMapHelp(): boolean {
  try {
    return localStorage.getItem(mapHelpSeenKey) === 'true';
  } catch {
    return false;
  }
}

export function rememberMapHelp(): void {
  try {
    localStorage.setItem(mapHelpSeenKey, 'true');
  } catch {
    /* Help remains usable when browser storage is unavailable. */
  }
}
