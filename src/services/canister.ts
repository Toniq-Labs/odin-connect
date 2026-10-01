import { PROTOCOL_VERSION } from "../constants";
import { createTokenValidators } from "../utils";
import { DEFAULT_LANG } from "../utils/lang";
import { OdinApiClient } from "./api";
import { AppInitOptions, Connect } from "./connect";
import {
  createRequestId,
  RedirectCallOptions,
  RedirectClient,
} from "./redirect";
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

export class OdinCanisterClient {
  private _window: WindowClient;
  private _appInfo: AppInitOptions;
  private _api: OdinApiClient;
  private _redirect: RedirectClient | null;
  origin: string;

  constructor(
    windowClient: WindowClient,
    apiClient: OdinApiClient,
    appInfo: AppInitOptions,
    origin: string,
    redirectClient: RedirectClient | null = null
  ) {
    this._window = windowClient;
    this._redirect = redirectClient;
    this._api = apiClient;
    this._appInfo = appInfo;
    this.origin = origin;
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

  private baseAction<ResolveType = string, MessageType = string>({
    params,
    odinPath,
    receivedMessageFromOrigin,
    resolve: resolveMessages,
    returnState,
  }: {
    params: Record<string, string | undefined>;
    returnState?: unknown;
    odinPath: string;
    receivedMessageFromOrigin: string | ((message: string) => boolean);
    resolve: {
      success: (message: MessageType, detail: unknown) => ResolveType;
      failure: string;
      close: string;
      didnotopen?: string;
    };
  }) {
    const requestId = createRequestId();
    if (this._redirect?.useRedirect) {
      // Same-tab round trip; the promise never settles. The app reads the
      // outcome with OdinConnect.handleRedirectResult() on its next load.
      const url = this.createUrl(odinPath, requestId);
      for (const key in params) {
        if (params[key]) {
          url.searchParams.append(key, params[key]);
        }
      }
      return this._redirect.start<ResolveType>(
        url,
        {
          path: "/" + odinPath,
          successMessage:
            typeof receivedMessageFromOrigin === "string"
              ? receivedMessageFromOrigin
              : undefined,
          returnState,
        },
        requestId
      );
    }
    return new Promise<ResolveType>((resolve, reject) => {
      const handleMessage = async (event: MessageEvent) => {
        if (
          event.origin === this.origin &&
          event.data.path === "/" + odinPath
        ) {
          window.removeEventListener("message", handleMessage);
          if (
            typeof receivedMessageFromOrigin === "function"
              ? receivedMessageFromOrigin(event.data.message)
              : receivedMessageFromOrigin === event.data.message
          ) {
            resolve(
              resolveMessages.success(
                event.data.message as MessageType,
                event.data.detail
              )
            );
          } else {
            reject(new Error(resolveMessages.failure));
          }
        }
      };
      const url = this.createUrl(odinPath, requestId);
      for (const key in params) {
        // exclude undefined params
        if (params[key]) {
          url.searchParams.append(key, params[key]);
        }
      }
      const opened = this._window.open(url);
      if (!opened || opened.closed || typeof opened.closed === "undefined") {
        reject(
          new Error(
            resolveMessages.didnotopen ??
              `Failed to open ${odinPath} window, please always allow popups and try again`
          )
        );
        return;
      }
      window.addEventListener("message", handleMessage);
    });
  }

  sell({ token, tokenAmount, principal, returnState }: SellOptions) {
    return this.baseAction<boolean, string>({
      params: {
        principal,
        token,
        amount: tokenAmount.toString(),
      },
      odinPath: "authorize/sell",
      returnState,
      receivedMessageFromOrigin: "sold",
      resolve: {
        success: () => true,
        failure: "Sell failed or was cancelled",
        close: "User closed the window",
      },
    });
  }

  buy({ principal, token, btcAmount, returnState }: BuyOptions) {
    return this.baseAction<boolean, string>({
      params: {
        principal,
        token,
        amount: btcAmount.toString(),
      },
      odinPath: "authorize/buy",
      returnState,
      receivedMessageFromOrigin: "purchased",
      resolve: {
        success: () => true,
        failure: "Purchase failed or was cancelled",
        close: "User closed the window",
      },
    });
  }

  transfer({
    principal,
    token,
    amount,
    destination,
    returnState,
  }: TransferOptions) {
    return this.baseAction<boolean, string>({
      params: {
        principal,
        token,
        amount: amount.toString(),
        destination,
      },
      odinPath: "authorize/transfer",
      returnState,
      receivedMessageFromOrigin: "transferred",
      resolve: {
        success: () => true,
        failure: "Transfer failed or was cancelled",
        close: "User closed the window",
      },
    });
  }

  addLiquidity({
    principal,
    btcAmount,
    token,
    returnState,
  }: AddLiquidityOptions) {
    return this.baseAction<boolean, string>({
      params: {
        principal,
        amount: btcAmount.toString(),
        token,
      },
      odinPath: "authorize/add_liquidity",
      returnState,
      receivedMessageFromOrigin: "addedLiquidity",
      resolve: {
        success: () => true,
        failure: "Add liquidity failed or was cancelled",
        close: "User closed the window",
      },
    });
  }

  removeLiquidity({
    principal,
    lpAmount,
    token,
    returnState,
  }: RemoveLiquidityOptions) {
    return this.baseAction<boolean, string>({
      params: {
        principal,
        amount: lpAmount.toString(),
        token,
      },
      odinPath: "authorize/remove_liquidity",
      returnState,
      receivedMessageFromOrigin: "removedLiquidity",
      resolve: {
        success: () => true,
        failure: "Remove liquidity failed or was cancelled",
        close: "User closed the window",
      },
    });
  }

  swap({
    principal,
    fromToken: from,
    toToken: to,
    fromAmount,
    returnState,
  }: SwapOptions) {
    return this.baseAction<boolean, string>({
      params: {
        principal,
        from,
        to,
        amount: fromAmount.toString(),
      },
      odinPath: "authorize/swap",
      returnState,
      receivedMessageFromOrigin: "swapped",
      resolve: {
        success: () => true,
        failure: "Swap failed or was cancelled",
        close: "User closed the window",
      },
    });
  }

  icrcApprove({
    principal,
    token,
    spender,
    amount,
    returnState,
  }: IcrcApproveOptions) {
    return this.baseAction<boolean, string>({
      params: {
        principal,
        token,
        spender,
        amount: amount.toString(),
      },
      odinPath: "authorize/icrc_approve",
      returnState,
      receivedMessageFromOrigin: "approved",
      resolve: {
        success: () => true,
        failure: "ICRC approve failed or was cancelled",
        close: "User closed the window",
      },
    });
  }

  async createToken({ image, returnState, ...params }: CreateTokenParams) {
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
    const imageUrl = await this._api.uploadImage(image);
    const result = await this.baseAction<boolean, string>({
      params: {
        ...params,
        image: imageUrl,
        buy: params.buy?.toString(),
      },
      odinPath: "authorize/create_token",
      returnState,
      receivedMessageFromOrigin: "tokenCreated",
      resolve: {
        success: () => true,
        failure: "Token creation failed or was cancelled",
        close: "User closed the window",
      },
    });
    if (!result) {
      throw new Error("Token creation failed. Please try again.");
    }
    return true;
  }
}
