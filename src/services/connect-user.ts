import { DelegationIdentity } from "@dfinity/identity";
import { OdinApi } from "./api";
import { Environment } from "../models/environment";

export class ConnectedUser {
  private _identity: DelegationIdentity | null;
  private _api: OdinApi;
  private _principal: string;

  constructor(
    principal: string,
    identity: DelegationIdentity | null,
    api: OdinApi
  ) {
    this._principal = principal;
    this._identity = identity;
    this._api = api;
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
}
