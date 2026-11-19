import { selectionFromQuery, type Selection } from "@stemcharades/shared";

const KEY = "stemcharades.preset";

/**
 * A choice carried in a link to the online screen (#/online?levels=2&courses=…). It is held for the tab
 * until the host's lobby opens, then applied once.
 */
export function savePresetFromHash(hash: string): void {
  const query = hash.split("?")[1];
  try {
    if (query) sessionStorage.setItem(KEY, query);
  } catch {
    /* storage blocked: the link simply opens without its choice */
  }
}

export function takePreset(): Selection | null {
  try {
    const query = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return query ? selectionFromQuery(query) : null;
  } catch {
    return null;
  }
}
