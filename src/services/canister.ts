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

/**
 * How an action result maps to a request status: the action's success
 * message → `"success"`, `"rejected"` → `"rejected"`, anything else →
 * `"failed"` (with the action's failure text as `error`).
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
  if (message === "rejected") return { status: "rejected" };
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
            requestId
          )
          .catch((error) => {
            throw this.fail(requestId, error);
          })
      );
    }
    return quiet(
      new Promise<boolean>((resolve, reject) => {
        const handleMessage = (event: MessageEvent) => {
          if (
            event.origin === this.origin &&
            event.data?.path === "/" + odinPath
          ) {
            window.removeEventListener("message", handleMessage);
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
