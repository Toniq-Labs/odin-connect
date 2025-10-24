import { DelegationIdentity } from "@dfinity/identity";
import { OdinApi } from "./api";
import { Connect } from "./connect";

export class ConnectedUser {
  private _identity: DelegationIdentity | null;
  private _api: OdinApi;
  private _principal: string;
  private _connect: Connect;

  constructor(
    principal: string,
    identity: DelegationIdentity | null,
    api: OdinApi,
    connect: Connect
  ) {
    this._principal = principal;
    this._identity = identity;
    this._api = api;
    this._connect = connect;
  }

  getIdentity(): DelegationIdentity | null {
    return this._identity;
  }

  getUser() {
    return this._api.getUser(this._principal);
  }

  getBalances(pagination: { page: number; limit: number }) {
    return this._api.getBalances(this._principal, pagination);
  }

  getUserTokens(pagination: { page: number; limit: number }) {
    return this._api.getUserTokens(this._principal, pagination);
  }

  /// others

  sell(params: Omit<Parameters<Connect["sell"]>[0], "principal">) {
    return this._connect.sell({
      ...params,
      principal: this._principal,
    });
  }

  buy(params: Omit<Parameters<Connect["buy"]>[0], "principal">) {
    return this._connect.buy({
      ...params,
      principal: this._principal,
    });
  }

  addLiquidity(
    params: Omit<Parameters<Connect["addLiquidity"]>[0], "principal">
  ) {
    return this._connect.addLiquidity({
      ...params,
      principal: this._principal,
    });
  }

  removeLiquidity(
    params: Omit<Parameters<Connect["removeLiquidity"]>[0], "principal">
  ) {
    return this._connect.removeLiquidity({
      ...params,
      principal: this._principal,
    });
  }

  transfer(params: Omit<Parameters<Connect["transfer"]>[0], "principal">) {
    return this._connect.transfer({
      ...params,
      principal: this._principal,
    });
  }
}
