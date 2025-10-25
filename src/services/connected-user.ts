import { DelegationIdentity } from "@dfinity/identity";
import { OdinApiClient } from "./api";
import {
  AddLiquidityOptions,
  BuyOptions,
  CreateTokenParams,
  OdinCanisterClient,
  RemoveLiquidityOptions,
  SellOptions,
  SwapOptions,
  TransferOptions,
} from "./canister";

export class ConnectedUser {
  private _identity: DelegationIdentity | null;
  private _api: OdinApiClient;
  private _principal: string;
  private _odin: OdinCanisterClient;

  constructor(
    principal: string,
    identity: DelegationIdentity | null,
    api: OdinApiClient,
    odin: OdinCanisterClient
  ) {
    this._principal = principal;
    this._identity = identity;
    this._api = api;
    this._odin = odin;
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

  getTokens(pagination: { page: number; limit: number }) {
    return this._api.getUserTokens(this._principal, pagination);
  }

  getActivity(pagination: { page: number; limit: number }) {
    return this._api.getUserActivity(this._principal, pagination);
  }

  getLiquidity(pagination: { page: number; limit: number }) {
    return this._api.getUserLiquidity(this._principal, pagination);
  }

  getAchievements(pagination: { page: number; limit: number }) {
    return this._api.getUserAchievements(this._principal, pagination);
  }

  /// others

  sell(params: Omit<SellOptions, "principal">) {
    return this._odin.sell({
      ...params,
      principal: this._principal,
    });
  }

  buy(params: Omit<BuyOptions, "principal">) {
    return this._odin.buy({
      ...params,
      principal: this._principal,
    });
  }

  addLiquidity(params: Omit<AddLiquidityOptions, "principal">) {
    return this._odin.addLiquidity({
      ...params,
      principal: this._principal,
    });
  }

  removeLiquidity(params: Omit<RemoveLiquidityOptions, "principal">) {
    return this._odin.removeLiquidity({
      ...params,
      principal: this._principal,
    });
  }

  transfer(params: Omit<TransferOptions, "principal">) {
    return this._odin.transfer({
      ...params,
      principal: this._principal,
    });
  }

  createToken(params: Omit<CreateTokenParams, "principal">) {
    return this._odin.createToken({
      ...params,
      principal: this._principal,
    });
  }

  swap(params: Omit<SwapOptions, "principal">) {
    return this._odin.swap({
      ...params,
      principal: this._principal,
    });
  }
}
