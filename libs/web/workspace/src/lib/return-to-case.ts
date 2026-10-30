import type { Router } from '@angular/router';

/** Closes a routed panel (such as the profile) so map work continues in the case workspace. */
export async function returnToCase(router: Router, state: { caseUrl(): string }): Promise<boolean> {
  const url = state.caseUrl();
  return router.url === url || router.navigateByUrl(url);
}
