import { User } from "../models/user";
import { OdinApi, Pagination, Sort } from "./api";
import { createTokenValidators } from "../utils";
import {
  DelegationChain,
  DelegationIdentity,
  Ed25519KeyIdentity,
  JsonnableDelegationChain,
} from "@dfinity/identity";
import type { DerEncodedPublicKey } from "@dfinity/agent";
import { ConnectedUser } from "./connect-user";
import { Environment, ORIGINS } from "../models/environment";

interface AppInitOptions {
  name: string;
  icon?: string;
  env?: Environment;
}
interface BaseConnectOptions {
  // options for window.open
  open?: {
    target: string;
    settings: string;
  };
  // whether to request an auth keys upon connection
  requires_api?: boolean;
}

interface ConnectOptionsWithDelegation extends BaseConnectOptions {
  // whether to request an auth keys upon connection
  requires_delegation: true;
  targets: string[];
}

interface ConnectOptionsWithoutDelegation extends BaseConnectOptions {
  requires_delegation?: false;
  targets?: never;
  session_key?: never;
}

type ConnectOptions =
  | ConnectOptionsWithDelegation
  | ConnectOptionsWithoutDelegation;

interface BuyOptions {
  principal: string;
  token: string;
  btcAmount: bigint;
}
interface SellOptions {
  principal: string;
  token: string;
  tokenAmount: bigint;
}
interface TransferOptions {
  principal: string;
  token: string;
  amount: bigint;
  destination: string;
}

interface GetBalanceOptions {
  principal: string;
  pagination: {
    page: number;
    limit: number;
  };
}

interface AddLiquidityOptions {
  principal: string;
  btcAmount: bigint;
  token: string;
}

interface RemoveLiquidityOptions {
  principal: string;
  lpAmount: bigint;
  token: string;
}

interface SwapOptions {
  principal: string;
  fromToken: string;
  toToken: string;
  fromAmount: bigint;
}

interface GetResourcesOptions {
  pagination: Pagination;
  sort?: Sort;
}

interface GetUserActivityOptions extends GetResourcesOptions {
  principal: string;
}

interface CreateTokenParams {
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

export class Connect {
  private _appInfo: AppInitOptions | null = null;
  private _api: OdinApi;
  private _windowSettings: ConnectOptions["open"];

  constructor(appInfo?: Partial<AppInitOptions>) {
    this._appInfo = {
      env: "prod",
      name: "app_name",
      ...appInfo,
    };
    this._api = new OdinApi(this._appInfo.env === "prod" ? "prod" : "dev");
    this._windowSettings = {
      target: "_blank",
      settings: "",
    };
  }

  private createUrl(path: string) {
    const url = new URL(`${this.origin}/${path}`);
    if (this._appInfo?.name) {
      url.searchParams.append("app_name", this._appInfo.name);
    }
    url.searchParams.append("referrer", window.location.origin);
    return url;
  }

  private openWindow(url: URL) {
    return window.open(
      url,
      this._windowSettings?.target || "_blank",
      this._windowSettings?.settings
    );
  }

  get origin() {
    return ORIGINS[this._appInfo?.env || "prod"];
  }

  connect({
    open,
    requires_api,
    requires_delegation,
    targets,
  }: ConnectOptions): Promise<ConnectedUser> {
    return new Promise<ConnectedUser>((resolve, reject) => {
      if (open) {
        this._windowSettings = open;
      }
      const sessionKey = Ed25519KeyIdentity.generate();
      const handleMessage = async (event: MessageEvent) => {
        if (
          event.origin === this.origin &&
          event.data.path === "/authorize/connect"
        ) {
          window.removeEventListener("message", handleMessage);
          if (event.data.message != "rejected") {
            let connectedUser: ConnectedUser;
            // the user accepted the connection
            try {
              const eventData = event.data.message as {
                principal: string;
                jwt: string;
                delegationChain?: JsonnableDelegationChain | null;
              };
              const { principal, jwt: jwtToken, delegationChain } = eventData;

              if (requires_api) {
                // issue a api key
                // only using JWT for now, it will change in the real implementation
                this._api.apiKey = jwtToken;
              }

              if (requires_delegation) {
                if (!delegationChain) {
                  throw new Error("Delegation chain is missing");
                }
                const identity = DelegationIdentity.fromDelegation(
                  sessionKey,
                  DelegationChain.fromJSON(delegationChain)
                );
                connectedUser = new ConnectedUser(
                  principal,
                  identity,
                  this.apiClient
                );
              } else {
                connectedUser = new ConnectedUser(
                  principal,
                  null,
                  this.apiClient
                );
              }

              resolve(connectedUser);
            } catch (error) {
              reject(new Error("Failed to fetch user data"));
            }
          } else {
            reject(new Error("User rejected the connection"));
          }
        }
      };
      const url = this.createUrl("authorize/connect");
      url.searchParams.append("requires_api", requires_api ? "1" : "0");
      if (requires_delegation) {
        url.searchParams.append("requires_delegation", "1");
        const sessionString = btoa(JSON.stringify(sessionKey.toJSON()));
        url.searchParams.append("session_key", sessionString);
        url.searchParams.append("targets", targets.join(","));
      }
      this.openWindow(url);

      window.addEventListener("message", handleMessage);
    });
  }

  async getBalances({ principal, pagination }: GetBalanceOptions) {
    if (!principal) {
      throw new Error("Principal is required to fetch balances");
    }
    return this._api.getBalances(principal, pagination);
  }

  get apiClient() {
    return this._api;
  }

  get currentEnv() {
    return this._appInfo?.env || "prod";
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

  hello() {
    console.log("Hello from Odin Connect!");
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
      this.openWindow(url);
      window.addEventListener("message", handleMessage);
    });
  }
}
