import { DelegationIdentity } from "@dfinity/identity";
import { OdinApiClient } from "./api";
import {
  AddLiquidityOptions,
  BuyOptions,
  CreateTokenParams,
  IcrcApproveOptions,
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

  get principal(): string {
    return this._principal;
  }

  set principal(principal: string) {
    this._principal = principal;
  }

  getIdentity(): DelegationIdentity | null {
    return this._identity;
  }

  getUser() {
    return this._api.getUser(this.principal);
  }

  getBalances(pagination: { page: number; limit: number }) {
    return this._api.getBalances(this.principal, pagination);
  }

  getBalance(tokenId: string) {
    return this._api.getBalance(this.principal, tokenId);
  }

  getTokens(pagination: { page: number; limit: number }) {
    return this._api.getUserTokens(this.principal, pagination);
  }

  getCreatedTokens(pagination: { page: number; limit: number }) {
    return this._api.getUserCreatedTokens(this.principal, pagination);
  }

  getActivity(pagination: { page: number; limit: number }) {
    return this._api.getUserActivity(this.principal, pagination);
  }

  getLiquidity(pagination: { page: number; limit: number }) {
    return this._api.getUserLiquidity(this.principal, pagination);
  }

  getAchievements(pagination: { page: number; limit: number }) {
    return this._api.getUserAchievements(this.principal, pagination);
  }

  getTransactions(pagination: { page: number; limit: number }) {
    return this._api.getUserTransactions(this.principal, pagination);
  }

  getStats() {
    return this._api.getUserStats(this.principal);
  }

  /// others

  sell(params: Omit<SellOptions, "principal">) {
    return this._odin.sell({
      ...params,
      principal: this.principal,
    });
  }

  buy(params: Omit<BuyOptions, "principal">) {
    return this._odin.buy({
      ...params,
      principal: this.principal,
    });
  }

  addLiquidity(params: Omit<AddLiquidityOptions, "principal">) {
    return this._odin.addLiquidity({
      ...params,
      principal: this.principal,
    });
  }

  removeLiquidity(params: Omit<RemoveLiquidityOptions, "principal">) {
    return this._odin.removeLiquidity({
      ...params,
      principal: this.principal,
    });
  }

  transfer(params: Omit<TransferOptions, "principal">) {
    return this._odin.transfer({
      ...params,
      principal: this.principal,
    });
  }

  createToken(params: Omit<CreateTokenParams, "principal">) {
    return this._odin.createToken({
      ...params,
      principal: this.principal,
    });
  }

  icrcApprove(params: Omit<IcrcApproveOptions, "principal">) {
    return this._odin.icrcApprove({
      ...params,
      principal: this.principal,
    });
  }

  swap(params: Omit<SwapOptions, "principal">) {
    return this._odin.swap({
      ...params,
      principal: this.principal,
    });
  }
}
