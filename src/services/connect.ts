import { User } from "../models/user";
import { OdinApi } from "./api";

const ORIGINS = {
  local: "http://localhost:5173",
  prod: "https://odin.fun",
  dev: "https://dev.odin.fun",
  _deployment_preview: "https://deploy-preview-1047--dev-odin-toniq.netlify.app"
};

interface AppInitOptions {
  name: string;
  icon?: string;
  env?: keyof typeof ORIGINS;
}
interface ConnectOptions {
  // options for window.open
  open?: {
    target: string;
    settings: string;
  };
  // whether to request an auth keys upon connection
  requires_api: boolean;
}

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

export class Connect {
  private _appInfo: AppInitOptions | null = null;
  private _api: OdinApi;
  private _windowSettings: ConnectOptions["open"];

  constructor(appInfo: Partial<AppInitOptions>) {
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
    return url;
  }

  private openWindow(url: URL, onClose: () => void) {
    return window.open(
      url,
      this._windowSettings?.target || "_blank",
      this._windowSettings?.settings
    );
  }

  get origin() {
    return ORIGINS[this._appInfo?.env || "prod"];
  }

  connect({ open, requires_api }: Partial<ConnectOptions>): Promise<User> {
    return new Promise<User>((resolve, reject) => {
      if (open) {
        this._windowSettings = open;
      }
      const handleMessage = async (event: MessageEvent) => {
        if (event.origin === this.origin) {
          window.removeEventListener("message", handleMessage);
          if (event.data != "rejected") {
            // the user accepted the connection
            if (requires_api) {
              // issue a api key
              this._api.apiKey = "some-api-key";
            }
            const userId = event.data;
            try {
              // we need to fetch user data from the api to get the full user object
              const user = await this._api.getUser(userId);
              resolve(user);
            } catch (error) {
              reject(new Error("Failed to fetch user data"));
            }
          } else {
            reject(new Error("User rejected the connection"));
          }
        }
      };
      this.openWindow(this.createUrl("authorize/connect"), () => {
        window.removeEventListener("message", handleMessage);
        reject("User closed the window");
      });

      window.addEventListener("message", handleMessage);
    });
  }

  async getBalances({ principal, pagination }: GetBalanceOptions) {
    if (!principal) {
      throw new Error("Principal is required to fetch balances");
    }
    return this._api.getBalances(principal, pagination);
  }

  async getTokens(pagination: { page: number; limit: number }) {
    return this._api.getTokens(pagination);
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
        success: true,
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
        success: true,
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
        success: true,
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
        success: true,
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
        success: true,
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
        success: true,
        failure: "Swap failed or was cancelled",
        close: "User closed the window",
      },
    });
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
    params: Record<string, string>;
    odinPath: string;
    receivedMessageFromOrigin: MessageType;
    resolve: {
      success: ResolveType;
      failure: string;
      close: string;
    };
  }) {
    return new Promise<ResolveType>((resolve, reject) => {
      const handleMessage = async (event: MessageEvent) => {
        if (event.origin === this.origin) {
          window.removeEventListener("message", handleMessage);
          if (event.data === receivedMessageFromOrigin) {
            resolve(resolveMessages.success);
          } else {
            reject(new Error(resolveMessages.failure));
          }
        }
      };
      const url = this.createUrl(odinPath);
      for (const key in params) {
        url.searchParams.append(key, params[key]);
      }
      this.openWindow(url, () => {
        window.removeEventListener("message", handleMessage);
        reject(new Error(resolveMessages.close));
      });
      window.addEventListener("message", handleMessage);
    });
  }
}
