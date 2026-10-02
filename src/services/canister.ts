import { PROTOCOL_VERSION } from "../constants";
import { createTokenValidators } from "../utils";
import { DEFAULT_LANG } from "../utils/lang";
import { OdinApiClient } from "./api";
import type { AppInitOptions } from "./connect";
import {
  createRequestId,
  RedirectCallOptions,
  RedirectClient,
} from "./redirect";
import {
  OdinAction,
  OdinActionDetail,
  OdinRejectReason,
  OdinRequestInput,
  OdinRequestState,
  StateStore,
} from "./state";
import { WindowClient } from "./window";

export interface SellOptions extends RedirectCallOptions {
  principal: string;
  token: string;
  tokenAmount: bigint;
}

export interface BuyOptions extends RedirectCallOptions {
  principal: string;
  token: string;
  btcAmount: bigint;
}

export interface TransferOptions extends RedirectCallOptions {
  principal: string;
  token: string;
  amount: bigint;
  destination: string;
}

export interface AddLiquidityOptions extends RedirectCallOptions {
  principal: string;
  btcAmount: bigint;
  token: string;
}

export interface RemoveLiquidityOptions extends RedirectCallOptions {
  principal: string;
  lpAmount: bigint;
  token: string;
}

export interface SwapOptions extends RedirectCallOptions {
  principal: string;
  fromToken: string;
  toToken: string;
  fromAmount: bigint;
}

export interface IcrcApproveOptions extends RedirectCallOptions {
  principal: string;
  token: string;
  spender: string;
  amount: bigint;
}

export interface CreateTokenParams extends RedirectCallOptions {
  principal: string;
  name: string;
  ticker: string;
  image: File;
  vanity_ticker?: string;
  description?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  buy?: bigint;
  discount?: string;
}

/**
 * Per action: the authorize path, the Odin message that means success, and
 * the error a failed or rejected popup call rejects with (as in 1.6.0).
 */
export const ACTIONS: Record<
  OdinAction,
  { path: string; success: string; failure: string }
> = {
  buy: {
    path: "authorize/buy",
    success: "purchased",
    failure: "Purchase failed or was cancelled",
  },
  sell: {
    path: "authorize/sell",
    success: "sold",
    failure: "Sell failed or was cancelled",
  },
  transfer: {
    path: "authorize/transfer",
    success: "transferred",
    failure: "Transfer failed or was cancelled",
  },
  swap: {
    path: "authorize/swap",
    success: "swapped",
    failure: "Swap failed or was cancelled",
  },
  add_liquidity: {
    path: "authorize/add_liquidity",
    success: "addedLiquidity",
    failure: "Add liquidity failed or was cancelled",
  },
  remove_liquidity: {
    path: "authorize/remove_liquidity",
    success: "removedLiquidity",
    failure: "Remove liquidity failed or was cancelled",
  },
  icrc_approve: {
    path: "authorize/icrc_approve",
    success: "approved",
    failure: "ICRC approve failed or was cancelled",
  },
  create_token: {
    path: "authorize/create_token",
    success: "tokenCreated",
    failure: "Token creation failed or was cancelled",
  },
};

/** Odin's `detail` when it is a plain object, else undefined. */
function readDetail(detail: unknown): OdinActionDetail | undefined {
  return detail !== null && typeof detail === "object" && !Array.isArray(detail)
    ? (detail as OdinActionDetail)
    : undefined;
}

/** SDK-only reject reason: the popup was closed without an answer. */
export const POPUP_CLOSED: OdinRejectReason = "popup_closed";
export const NAVIGATED_BACK: OdinRejectReason = "navigated_back";

const REJECT_REASON_PATTERN = /^[a-z0-9_]{1,64}$/;

/**
 * Odin's `detail.reason` on a rejection (an `OdinRejectReason` code), else
 * undefined. Only short snake_case codes are accepted.
 */
export function readRejectReason(detail: unknown): string | undefined {
  const reason = readDetail(detail)?.reason;
  return typeof reason === "string" && REJECT_REASON_PATTERN.test(reason)
    ? reason
    : undefined;
}

/**
 * How an action result maps to a request status: the action's success
 * message → `"success"`, `"rejected"` → `"rejected"` (with Odin's
 * `detail.reason` as `error`, if any), anything else → `"failed"` (with the
 * action's failure text as `error`).
 */
export function actionOutcome(
  action: OdinAction,
  message: unknown,
  detail: unknown
): {
  status: "success" | "rejected" | "failed";
  detail?: OdinActionDetail;
  error?: string;
} {
  if (message === ACTIONS[action].success) {
    const parsed = readDetail(detail);
    return { status: "success", ...(parsed ? { detail: parsed } : {}) };
  }
  if (message === "rejected") {
    const reason = readRejectReason(detail);
    return { status: "rejected", ...(reason ? { error: reason } : {}) };
  }
  return { status: "failed", error: ACTIONS[action].failure };
}

/**
 * Mark a returned promise as handled, so an app that only renders from
 * `subscribe()` and never awaits gets no unhandled rejection. Awaiting it
 * still throws.
 */
export function quiet<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => {});
  return promise;
}

/** How often an open popup is checked for having been closed. */
export const POPUP_CLOSED_POLL_MS = 500;

/**
 * How long a closed popup's answer is still waited for. The Odin page posts
 * its result and then closes itself, so a poll can see `closed` before the
 * answer's message event has been handled.
 */
export const POPUP_CLOSED_GRACE_MS = 1500;

/**
 * Watch a request's popup until it closes, and call `onClosed` then — once
 * the popup has stayed closed for `POPUP_CLOSED_GRACE_MS` without an answer
 * (an answer arriving meanwhile is handled as usual and calls `stop()`).
 * Stops (clears its timers) when the returned function is called (the
 * request got its answer), and on its own once `requestId` is no longer the
 * pending `state.request` (it settled, a newer request replaced it,
 * `disconnect()`), also during the grace period. `onClosed` is called at
 * most once, and never after `stop()`.
 */
export function watchPopupClosed(
  popup: Window,
  requestId: string,
  store: StateStore | null,
  onClosed: () => void
): () => void {
  let stopped = false;
  let unsubscribe: (() => void) | null = null;
  let grace: ReturnType<typeof setTimeout> | null = null;
  const isPending = () => {
    if (!store) return true;
    const { request } = store.state;
    return request?.id === requestId && request.status === "pending";
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    if (grace !== null) clearTimeout(grace);
    unsubscribe?.();
  };
  const timer = setInterval(() => {
    if (!popup.closed || grace !== null) return;
    clearInterval(timer);
    // closed: give an answer that was posted right before it time to land
    grace = setTimeout(() => {
      const pending = isPending();
      stop();
      if (pending) onClosed();
    }, POPUP_CLOSED_GRACE_MS);
  }, POPUP_CLOSED_POLL_MS);
  unsubscribe =
    store?.subscribe(() => {
      if (!isPending()) stop();
    }) ?? null;
  return stop;
}

type ActionRequest<A extends OdinAction> = {
  action: A;
  input: OdinRequestInput[A];
  params: Record<string, string | undefined>;
  returnState?: unknown;
  requestId?: string;
};

export class OdinCanisterClient {
  private _window: WindowClient;
  private _appInfo: AppInitOptions;
  private _api: OdinApiClient;
  private _redirect: RedirectClient | null;
  private _store: StateStore | null;
  origin: string;

  constructor(
    windowClient: WindowClient,
    apiClient: OdinApiClient,
    appInfo: AppInitOptions,
    origin: string,
    redirectClient: RedirectClient | null = null,
    store: StateStore | null = null
  ) {
    this._window = windowClient;
    this._redirect = redirectClient;
    this._api = apiClient;
    this._appInfo = appInfo;
    this.origin = origin;
    this._store = store;
  }

  get appInfo() {
    return this._appInfo;
  }

  /** Authorize URL with the protocol flag and a fresh `request_id`. */
  private createUrl(path: string, requestId: string = createRequestId()) {
    const url = new URL(`${this.origin}/${path}`);
    url.searchParams.append("v", PROTOCOL_VERSION);
    url.searchParams.append("request_id", requestId);
    if (this._appInfo?.name) {
      url.searchParams.append("app_name", this._appInfo.name);
    }
    url.searchParams.append("referrer", window.location.origin);
    url.searchParams.append("lang", this._appInfo?.lang || DEFAULT_LANG);
    return url;
  }

  private startRequest<A extends OdinAction>(
    id: string,
    action: A,
    input: OdinRequestInput[A],
    returnState: unknown
  ) {
    this._store?.dispatch({
      type: "request",
      request: {
        id,
        action,
        status: "pending",
        input,
        ...(returnState !== undefined ? { returnState } : {}),
      } as OdinRequestState,
    });
  }

  /** Mark the request failed and return the error to reject with. */
  private fail(id: string, error: unknown): Error {
    const err = error instanceof Error ? error : new Error(String(error));
    this._store?.dispatch({
      type: "settle",
      id,
      status: "failed",
      error: err.message,
    });
    return err;
  }

  /**
   * Every action: record the request as pending, then either navigate the
   * tab (redirect mode: `ready()` applies the outcome on the next load and
   * the promise never settles) or open a popup and settle on its message.
   */
  private baseAction<A extends OdinAction>({
    action,
    input,
    params,
    returnState,
    requestId = createRequestId(),
  }: ActionRequest<A>): Promise<boolean> {
    const { path: odinPath, failure } = ACTIONS[action];
    this.startRequest(requestId, action, input, returnState);
    const url = this.createUrl(odinPath, requestId);
    for (const key in params) {
      // exclude undefined params
      if (params[key]) {
        url.searchParams.append(key, params[key]);
      }
    }
    if (this._redirect?.useRedirect) {
      return quiet(
        this._redirect
          .start<boolean>(
            url,
            {
              path: "/" + odinPath,
              input,
              returnState,
            },
            requestId,
            () =>
              this._store?.dispatch({
                type: "settle",
                id: requestId,
                status: "rejected",
                error: NAVIGATED_BACK,
              })
          )
          .catch((error) => {
            throw this.fail(requestId, error);
          })
      );
    }
    return quiet(
      new Promise<boolean>((resolve, reject) => {
        let stopWatching = () => {};
        const handleMessage = (event: MessageEvent) => {
          if (
            event.origin === this.origin &&
            event.data?.path === "/" + odinPath
          ) {
            window.removeEventListener("message", handleMessage);
            stopWatching();
            const outcome = actionOutcome(
              action,
              event.data.message,
              event.data.detail
            );
            this._store?.dispatch({
              type: "settle",
              id: requestId,
              ...outcome,
            });
            if (outcome.status === "success") {
              resolve(true);
            } else {
              reject(new Error(failure));
            }
          }
        };
        const opened = this._window.open(url);
        if (!opened || opened.closed || typeof opened.closed === "undefined") {
          reject(
            this.fail(
              requestId,
              `Failed to open ${odinPath} window, please always allow popups and try again`
            )
          );
          return;
        }
        window.addEventListener("message", handleMessage);
        // closed without an answer (the page's own "rejected" on unload is
        // not reliable): settle it as rejected after the grace period; an
        // answer within it is handled as usual, a later one is ignored
        stopWatching = watchPopupClosed(opened, requestId, this._store, () => {
          window.removeEventListener("message", handleMessage);
          this._store?.dispatch({
            type: "settle",
            id: requestId,
            status: "rejected",
            error: POPUP_CLOSED,
          });
          reject(new Error(failure));
        });
      })
    );
  }

  sell({ token, tokenAmount, principal, returnState }: SellOptions) {
    return this.baseAction({
      action: "sell",
      input: { token, tokenAmount },
      params: { principal, token, amount: tokenAmount.toString() },
      returnState,
    });
  }

  buy({ principal, token, btcAmount, returnState }: BuyOptions) {
    return this.baseAction({
      action: "buy",
      input: { token, btcAmount },
      params: { principal, token, amount: btcAmount.toString() },
      returnState,
    });
  }

  transfer({
    principal,
    token,
    amount,
    destination,
    returnState,
  }: TransferOptions) {
    return this.baseAction({
      action: "transfer",
      input: { token, amount, destination },
      params: { principal, token, amount: amount.toString(), destination },
      returnState,
    });
  }

  addLiquidity({
    principal,
    btcAmount,
    token,
    returnState,
  }: AddLiquidityOptions) {
    return this.baseAction({
      action: "add_liquidity",
      input: { token, btcAmount },
      params: { principal, amount: btcAmount.toString(), token },
      returnState,
    });
  }

  removeLiquidity({
    principal,
    lpAmount,
    token,
    returnState,
  }: RemoveLiquidityOptions) {
    return this.baseAction({
      action: "remove_liquidity",
      input: { token, lpAmount },
      params: { principal, amount: lpAmount.toString(), token },
      returnState,
    });
  }

  swap({
    principal,
    fromToken,
    toToken,
    fromAmount,
    returnState,
  }: SwapOptions) {
    return this.baseAction({
      action: "swap",
      input: { fromToken, toToken, fromAmount },
      params: {
        principal,
        from: fromToken,
        to: toToken,
        amount: fromAmount.toString(),
      },
      returnState,
    });
  }

  icrcApprove({
    principal,
    token,
    spender,
    amount,
    returnState,
  }: IcrcApproveOptions) {
    return this.baseAction({
      action: "icrc_approve",
      input: { token, spender, amount },
      params: { principal, token, spender, amount: amount.toString() },
      returnState,
    });
  }

  /**
   * Validates, uploads the image, then authorizes like any action. The
   * request is pending from the start (`input.image` is set once the upload
   * finished); a validation or upload error marks it failed.
   */
  createToken({
    image,
    returnState,
    principal,
    ...params
  }: CreateTokenParams): Promise<boolean> {
    const requestId = createRequestId();
    const input: OdinRequestInput["create_token"] = { ...params };
    this.startRequest(requestId, "create_token", input, returnState);
    return quiet(
      (async () => {
        let imageUrl: string;
        try {
          // check if token field param validators exist and run them
          for (const key in createTokenValidators) {
            if (key in params) {
              const field = key as keyof typeof createTokenValidators;
              const errors = createTokenValidators[field]?.(
                params[key as keyof typeof params] || null
              );
              if (errors) {
                throw new Error(errors);
              }
            }
          }
          // additional validations for discount code
          if (params.discount) {
            if (!/^[A-Za-z0-9]{10}$/.test(params.discount)) {
              throw new Error(
                "Discount code must be alphanumeric and exactly 10 characters long."
              );
            }
          }
          imageUrl = await this._api.uploadImage(image);
        } catch (error) {
          throw this.fail(requestId, error);
        }
        return this.baseAction({
          action: "create_token",
          input: { ...input, image: imageUrl },
          params: {
            ...params,
            principal,
            image: imageUrl,
            buy: params.buy?.toString(),
          },
          returnState,
          requestId,
        });
      })()
    );
  }
}
