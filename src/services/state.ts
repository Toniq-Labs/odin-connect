/**
 * The one place results land. Popup messages, redirect results (read by
 * `ready()` on the next page load) and the stored session all go through
 * `reduce()`; the app reads `OdinConnect.state` and `subscribe()`s to it.
 * Every change produces a new frozen snapshot, so `getState()` returns the
 * same object until something changes (what `useSyncExternalStore` needs).
 */
import type { ConnectedUser } from "./connected-user";

/** Authorize actions started from `ConnectedUser` (or `OdinConnect.odin`). */
export type OdinAction =
  | "buy"
  | "sell"
  | "transfer"
  | "swap"
  | "add_liquidity"
  | "remove_liquidity"
  | "icrc_approve"
  | "create_token";

/**
 * Extra data Odin returns with an action result. `icrc_approve` carries
 * `block_index` (decimal string) and `memo` (hex of sha256(request_id));
 * other actions carry nothing today.
 */
export type OdinActionDetail = {
  block_index?: string;
  memo?: string;
  [key: string]: unknown;
};

/**
 * - `"pending"`: started; the popup is open or the tab is on its way to Odin.
 * - `"success"`: Odin confirmed it (a connect also passed every verification).
 * - `"rejected"`: the user declined in the Odin page.
 * - `"failed"`: anything else (popup blocked, Odin reported an error, ...).
 * - `"unverified"`: connect only; Odin's answer could not be verified, the
 *   user is not connected and nothing was stored.
 */
export type OdinRequestStatus =
  "pending" | "success" | "rejected" | "failed" | "unverified";

/**
 * What the app asked for, per action (the arguments of `connect()` /
 * `user.<action>()` without `returnState`). Amounts stay `bigint`, also
 * across a redirect. `create_token` holds the uploaded image URL (set once
 * the upload finished), never the `File`.
 */
export type OdinRequestInput = {
  connect: {
    requires_api: boolean;
    requires_delegation: boolean;
    targets: string[];
  };
  buy: { token: string; btcAmount: bigint };
  sell: { token: string; tokenAmount: bigint };
  transfer: { token: string; amount: bigint; destination: string };
  swap: { fromToken: string; toToken: string; fromAmount: bigint };
  add_liquidity: { token: string; btcAmount: bigint };
  remove_liquidity: { token: string; lpAmount: bigint };
  icrc_approve: { token: string; spender: string; amount: bigint };
  create_token: {
    name: string;
    ticker: string;
    image?: string;
    vanity_ticker?: string;
    description?: string;
    website?: string;
    twitter?: string;
    telegram?: string;
    buy?: bigint;
    discount?: string;
  };
};

/** The latest request, discriminated by `action` (narrows `input`). */
export type OdinRequestState = {
  [A in keyof OdinRequestInput]: {
    /** The request's `request_id`. */
    id: string;
    action: A;
    status: OdinRequestStatus;
    input: OdinRequestInput[A];
    /** Set on a successful action that returned data (e.g. icrc_approve). */
    detail?: OdinActionDetail;
    /** Whatever was passed as `returnState` to the call, in both modes. */
    returnState?: unknown;
    /** Why it is `"failed"` or `"unverified"`. */
    error?: string;
  };
}[keyof OdinRequestInput];

export type OdinState = {
  /** `"initializing"` until `ready()` has restored the session. */
  status: "initializing" | "ready";
  user: ConnectedUser | null;
  /** The latest request; a new request replaces it. */
  request: OdinRequestState | null;
};

export type OdinStateListener = (state: OdinState) => void;

type StateEvent =
  /** `ready()` finished: the restored user and a redirect outcome, if any. */
  | {
      type: "ready";
      user: ConnectedUser | null;
      request: OdinRequestState | null;
    }
  /** A request started (or was updated before settling, same id). */
  | { type: "request"; request: OdinRequestState }
  /**
   * A request settled; ignored when a newer request replaced it (or
   * `disconnect()` cleared it): neither `request` nor `user` changes then.
   */
  | {
      type: "settle";
      id: string;
      status: Exclude<OdinRequestStatus, "pending">;
      detail?: OdinActionDetail;
      error?: string;
      /** connect success: the verified user. */
      user?: ConnectedUser;
    }
  | { type: "disconnect" };

function freezeRequest(request: OdinRequestState): OdinRequestState {
  if (Object.isFrozen(request)) return request;
  Object.freeze(request.input);
  if (request.detail) Object.freeze(request.detail);
  return Object.freeze(request);
}

function snapshot(state: OdinState): OdinState {
  return Object.freeze({
    ...state,
    request: state.request ? freezeRequest(state.request) : null,
  });
}

/** Pure: the next state, or the same object when nothing changes. */
function reduce(state: OdinState, event: StateEvent): OdinState {
  switch (event.type) {
    case "ready":
      return snapshot({
        status: "ready",
        // a popup connect that finished while restoring is newer
        user: state.user ?? event.user,
        // so is a request started while restoring
        request: state.request ?? event.request,
      });
    case "request":
      return snapshot({ ...state, request: { ...event.request } });
    case "settle": {
      const current = state.request;
      if (!current || current.id !== event.id) return state;
      const request = {
        ...current,
        status: event.status,
        ...(event.detail ? { detail: event.detail } : {}),
        ...(event.error !== undefined ? { error: event.error } : {}),
      } as OdinRequestState;
      return snapshot({ ...state, user: event.user ?? state.user, request });
    }
    case "disconnect":
      if (state.user === null && state.request === null) return state;
      return snapshot({ ...state, user: null, request: null });
  }
}

/**
 * The state before `ready()` restored anything, and always on a server. A
 * frozen constant: pass it as `useSyncExternalStore`'s `getServerSnapshot`
 * (`() => INITIAL_ODIN_STATE`, or `odin.getServerState`) so hydration
 * renders the same "initializing" state the server did.
 */
export const INITIAL_ODIN_STATE: OdinState = Object.freeze({
  status: "initializing",
  user: null,
  request: null,
});

/** Holds one `OdinConnect`'s state and its listeners. */
export class StateStore {
  private _state: OdinState = INITIAL_ODIN_STATE;
  private _listeners = new Set<OdinStateListener>();

  get state(): OdinState {
    return this._state;
  }

  dispatch(event: StateEvent): void {
    const next = reduce(this._state, event);
    if (next === this._state) return;
    this._state = next;
    for (const listener of [...this._listeners]) {
      // unsubscribed by an earlier listener during this dispatch
      if (!this._listeners.has(listener)) continue;
      try {
        listener(next);
      } catch (error) {
        // one broken listener must not stop the others or the SDK flow
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  subscribe(listener: OdinStateListener): () => void {
    // a wrapper, so subscribing the same function twice needs two unsubscribes
    const entry: OdinStateListener = (state) => listener(state);
    this._listeners.add(entry);
    return () => {
      this._listeners.delete(entry);
    };
  }
}
