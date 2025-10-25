import { OdinApiClient, Pagination, Sort } from "./api";
import {
  DelegationChain,
  DelegationIdentity,
  Ed25519KeyIdentity,
  JsonnableDelegationChain,
} from "@dfinity/identity";
import { ConnectedUser } from "./connected-user";
import { Environment, ORIGINS } from "../models/environment";
import { WindowClient, WindowClientSettings } from "./window";
import { OdinCanisterClient } from "./canister";

export interface AppInitOptions {
  name: string;
  icon?: string;
  env?: Environment;
}
interface BaseConnectOptions {
  // options for window.open
  open?: WindowClientSettings;
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

interface GetResourcesOptions {
  pagination: Pagination;
  sort?: Sort;
}

interface GetUserActivityOptions extends GetResourcesOptions {
  principal: string;
}

export class Connect {
  private _appInfo: AppInitOptions | null = null;
  private _api: OdinApiClient;
  private _window: WindowClient;
  private _odin: OdinCanisterClient;

  constructor(appInfo?: Partial<AppInitOptions>) {
    this._appInfo = {
      env: "prod",
      name: "app_name",
      ...appInfo,
    };
    this._api = new OdinApiClient(
      this._appInfo.env === "prod" ? "prod" : "dev"
    );
    this._window = new WindowClient();
    this._odin = new OdinCanisterClient(
      this._window,
      this._api,
      this._appInfo,
      ORIGINS[this._appInfo.env || "prod"]
    );
  }

  private createUrl(path: string) {
    const url = new URL(`${this.origin}/${path}`);
    if (this._appInfo?.name) {
      url.searchParams.append("app_name", this._appInfo.name);
    }
    url.searchParams.append("referrer", window.location.origin);
    return url;
  }

  get origin() {
    return ORIGINS[this._appInfo?.env || "prod"];
  }

  get appInfo() {
    return this._appInfo;
  }

  connect(
    {
      open,
      requires_api,
      requires_delegation,
      targets,
    }: ConnectOptions | undefined = {
      requires_delegation: false,
      requires_api: false,
    }
  ): Promise<ConnectedUser> {
    return new Promise<ConnectedUser>((resolve, reject) => {
      if (open) {
        this._window.settings = open;
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
                  this.api,
                  this._odin
                );
              } else {
                connectedUser = new ConnectedUser(
                  principal,
                  null,
                  this.api,
                  this._odin
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
        url.searchParams.append("targets", targets?.join(",") || "");
      }
      this._window.open(url);

      window.addEventListener("message", handleMessage);
    });
  }

  get api() {
    return this._api;
  }

  get odin() {
    return this._odin;
  }

  get currentEnv() {
    return this._appInfo?.env || "prod";
  }

  hello() {
    console.log("Hello from Odin Connect!");
  }
}
