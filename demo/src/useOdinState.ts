import { useSyncExternalStore } from "react";
import type { OdinConnect, OdinState } from "odin-connect";

/**
 * The SDK's state (user + latest request) as React state. Same code for
 * popup and redirect mode: results land here either way.
 */
export const useOdinState = (odin: OdinConnect): OdinState =>
  useSyncExternalStore(odin.subscribe, odin.getState, odin.getState);
