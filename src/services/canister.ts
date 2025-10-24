import { createTokenValidators } from "../utils";
import { OdinApiClient } from "./api";
import { AppInitOptions, Connect } from "./connect";
import { WindowClient } from "./window";

export interface SellOptions {
  principal: string;
  token: string;
  tokenAmount: bigint;
}

export interface BuyOptions {
  principal: string;
  token: string;
  btcAmount: bigint;
}

export interface TransferOptions {
  principal: string;
  token: string;
  amount: bigint;
  destination: string;
}

export interface AddLiquidityOptions {
  principal: string;
  btcAmount: bigint;
  token: string;
}

export interface RemoveLiquidityOptions {
  principal: string;
  lpAmount: bigint;
  token: string;
}

export interface SwapOptions {
  principal: string;
  fromToken: string;
  toToken: string;
  fromAmount: bigint;
}

export interface CreateTokenParams {
  principal: string;
  name: string;
  ticker: string;
  image: File;
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
  origin: string;

  constructor(
    windowClient: WindowClient,
    apiClient: OdinApiClient,
    appInfo: AppInitOptions,
    origin: string
  ) {
    this._window = windowClient;
    this._api = apiClient;
    this._appInfo = appInfo;
    this.origin = origin;
  }

  get appInfo() {
    return this._appInfo;
  }

  private createUrl(path: string) {
    const url = new URL(`${this.origin}/${path}`);
    if (this._appInfo?.name) {
      url.searchParams.append("app_name", this._appInfo.name);
    }
    url.searchParams.append("referrer", window.location.origin);
    return url;
  }

  private baseAction<ResolveType = string, MessageType = string>({
    params,
    odinPath,
    receivedMessageFromOrigin,
    resolve: resolveMessages,
  }: {
    params: Record<string, string | undefined>;
    odinPath: string;
    receivedMessageFromOrigin: string | ((message: string) => boolean);
    resolve: {
      success: (message: MessageType) => ResolveType;
      failure: string;
      close: string;
    };
  }) {
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
            resolve(resolveMessages.success(event.data.message as MessageType));
          } else {
            reject(new Error(resolveMessages.failure));
          }
        }
      };
      const url = this.createUrl(odinPath);
      for (const key in params) {
        // exclude undefined params
        if (params[key]) {
          url.searchParams.append(key, params[key]);
        }
      }
      this._window.open(url);
      window.addEventListener("message", handleMessage);
    });
  }

  sell({ token, tokenAmount, principal }: SellOptions) {
    return this.baseAction<boolean, string>({
      params: {
        principal,
        token,
        amount: tokenAmount.toString(),
      },
      odinPath: "authorize/sell",
      receivedMessageFromOrigin: "sold",
      resolve: {
        success: () => true,
        failure: "Sell failed or was cancelled",
        close: "User closed the window",
      },
    });
  }

  buy({ principal, token, btcAmount }: BuyOptions) {
    return this.baseAction<boolean, string>({
      params: {
        principal,
        token,
        amount: btcAmount.toString(),
      },
      odinPath: "authorize/buy",
      receivedMessageFromOrigin: "purchased",
      resolve: {
        success: () => true,
        failure: "Purchase failed or was cancelled",
        close: "User closed the window",
      },
    });
  }

  transfer({ principal, token, amount, destination }: TransferOptions) {
    return this.baseAction<boolean, string>({
      params: {
        principal,
        token,
        amount: amount.toString(),
        destination,
      },
      odinPath: "authorize/transfer",
      receivedMessageFromOrigin: "transferred",
      resolve: {
        success: () => true,
        failure: "Transfer failed or was cancelled",
        close: "User closed the window",
      },
    });
  }

  addLiquidity({ principal, btcAmount, token }: AddLiquidityOptions) {
    return this.baseAction<boolean, string>({
      params: {
        principal,
        amount: btcAmount.toString(),
        token,
      },
      odinPath: "authorize/add_liquidity",
      receivedMessageFromOrigin: "addedLiquidity",
      resolve: {
        success: () => true,
        failure: "Add liquidity failed or was cancelled",
        close: "User closed the window",
      },
    });
  }

  removeLiquidity({ principal, lpAmount, token }: RemoveLiquidityOptions) {
    return this.baseAction<boolean, string>({
      params: {
        principal,
        amount: lpAmount.toString(),
        token,
      },
      odinPath: "authorize/remove_liquidity",
      receivedMessageFromOrigin: "removedLiquidity",
      resolve: {
        success: () => true,
        failure: "Remove liquidity failed or was cancelled",
        close: "User closed the window",
      },
    });
  }

  swap({ principal, fromToken: from, toToken: to, fromAmount }: SwapOptions) {
    return this.baseAction<boolean, string>({
      params: {
        principal,
        from,
        to,
        amount: fromAmount.toString(),
      },
      odinPath: "authorize/swap",
      receivedMessageFromOrigin: "swapped",
      resolve: {
        success: () => true,
        failure: "Swap failed or was cancelled",
        close: "User closed the window",
      },
    });
  }

  async createToken({ image, ...params }: CreateTokenParams) {
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
