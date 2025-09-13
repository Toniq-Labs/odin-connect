import { User } from "../models/user";
import { OdinApi } from "./api";

const ORIGINS = {
  local: "http://localhost:5173",
  prod: "https://odin.fun",
  dev: "https://dev.odin.fun",
};

interface AppInitOptions {
  name?: string;
  icon?: string;
  env?: keyof typeof ORIGINS;
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
    const childWindow = window.open(
      url,
      this._windowSettings.target,
      this._windowSettings.settings
    );
    // Polling to check if the window is closed
    // maybe there's a better way to do this?
    const id = setInterval(() => {
      if (childWindow?.closed) {
        clearInterval(id);
        onClose();
      }
    }, 1000);
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
              reject("Failed to fetch user data");
            }
          } else {
            reject("User rejected the connection");
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

  async getBalances({ principal }: GetBalanceOptions) {
    if (!principal) {
      throw new Error("Principal is required to fetch balances");
    }
    return this._api.getBalances(principal);
  }

  async transfer({ principal, token, amount, destination }: TransferOptions) {
    return new Promise<boolean>((resolve, reject) => {
      const handleMessage = async (event: MessageEvent) => {
        if (event.origin === this.origin) {
          window.removeEventListener("message", handleMessage);
          if (event.data === "transferred") {
            resolve(true);
          } else {
            reject("Transfer failed or was cancelled");
          }
        }
      };
      const url = this.createUrl("authorize/transfer");
      url.searchParams.append("principal", principal);
      url.searchParams.append("token", token);
      url.searchParams.append("amount", amount.toString());
      url.searchParams.append("destination", destination);
      this.openWindow(url, () => {
        window.removeEventListener("message", handleMessage);
        reject("User closed the window");
      });
      window.addEventListener("message", handleMessage);
    });
  }

  async buy({ token, btcAmount, principal }: BuyOptions) {
    return new Promise<boolean>((resolve, reject) => {
      const handleMessage = async (event: MessageEvent) => {
        if (event.origin === this.origin) {
          window.removeEventListener("message", handleMessage);
          if (event.data === "purchased") {
            try {
              resolve(true);
            } catch (error) {
              reject("Failed to parse purchased amount");
            }
          } else {
            reject("Purchase failed or was cancelled");
          }
        }
      };
      const url = this.createUrl("authorize/buy");
      url.searchParams.append("principal", principal);
      url.searchParams.append("token", token);
      url.searchParams.append("amount", btcAmount.toString());
      this.openWindow(url, () => {
        window.removeEventListener("message", handleMessage);
        reject("User closed the window");
      });
      window.addEventListener("message", handleMessage);
    });
  }

  async sell({ token, tokenAmount, principal }: SellOptions) {
    return new Promise<boolean>((resolve, reject) => {
      const handleMessage = async (event: MessageEvent) => {
        if (event.origin === this.origin) {
          window.removeEventListener("message", handleMessage);
          if (event.data === "sold") {
            try {
              resolve(true);
            } catch (error) {
              reject("Failed to parse sold amount");
            }
          } else {
            reject("Sell failed or was cancelled");
          }
        }
      };
      const url = this.createUrl("authorize/sell");
      url.searchParams.append("principal", principal);
      url.searchParams.append("token", token);
      url.searchParams.append("amount", tokenAmount.toString());
      this.openWindow(url, () => {
        window.removeEventListener("message", handleMessage);
        reject("User closed the window");
      });
      window.addEventListener("message", handleMessage);
    });
  }

  hello() {
    console.log("Hello from Odin Connect!");
  }
}
