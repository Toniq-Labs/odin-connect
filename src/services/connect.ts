import { User } from "../models/user";
import { OdinApi } from "./api";

const ORIGIN = {
  local: "http://localhost:5173",
  prod: "https://odin.fun",
  dev: "https://dev.odin.fun",
};

interface AppInitOptions {
  name?: string;
  icon?: string;
  env?: keyof typeof ORIGIN;
}
interface ConnectOptions {
  // options for window.open
  open: {
    target: string;
    settings: string;
  };
  requires_api: boolean;
}

interface BuyOptions {
  principal: string;
  token: string;
  amount: bigint;
}

interface GetBalanceOptions {
  principal: string;
}

export class Connect {
  private _appInfo: AppInitOptions | null = null;
  private _api: OdinApi;
  private _windowSettings: ConnectOptions["open"];

  constructor(appInfo: Partial<AppInitOptions>) {
    this._appInfo = {
      env: "prod",
      ...appInfo,
    };
    this._api = new OdinApi();
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

  private openWindow(url: URL) {
    window.open(
      url,
      this._windowSettings.target,
      this._windowSettings.settings
    );
  }

  get origin() {
    return ORIGIN[this._appInfo?.env || "prod"];
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
              const user = await this._api.getUser(userId);
              resolve(user);
            } catch (error) {
              reject("Failed to fetch user data");
            }
          } else {
            reject("User rejected the connection");
          }
        }
      };
      this.openWindow(this.createUrl("authorize"));
      window.addEventListener("message", handleMessage);
    });
  }

  async getBalances({ principal }: GetBalanceOptions) {
    if (!principal) {
      throw new Error("Principal is required to fetch balances");
    }
    return this._api.getBalances(principal);
  }

  buy({ token, amount, principal }: BuyOptions) {
    return new Promise<boolean>((resolve, reject) => {
      const handleMessage = async (event: MessageEvent) => {
        if (event.origin === this.origin) {
          window.removeEventListener("message", handleMessage);
          if (event.data === "purchased") {
            resolve(true);
          } else {
            reject("Purchase failed or was cancelled");
          }
        }
      };
      const url = this.createUrl("authorize");
      url.searchParams.append("principal", principal);
      url.searchParams.append("token", token);
      url.searchParams.append("amount", amount.toString());
      this.openWindow(url);
      window.addEventListener("message", handleMessage);
    });
  }

  hello() {
    console.log("Hello from Odin Connect!");
  }
}
