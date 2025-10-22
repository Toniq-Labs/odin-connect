import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export interface AddRequest {
  'metadata' : Metadata,
  'rune' : Rune,
  'divisibility' : bigint,
  'liquidity_threshold' : TokenAmount,
  'supply' : TokenAmount,
  'icrc_canister' : Principal,
  'price' : TokenAmount,
}
export type AddResponse = { 'ok' : string } |
  { 'err' : string };
export interface BondingCurveSettings {
  'a' : number,
  'b' : number,
  'c' : number,
  'name' : string,
}
export interface EtchRequest {
  'tokenid' : TokenID,
  'rune' : string,
  'icrc_ledger' : string,
  'rune_id' : string,
}
export type EtchResponse = { 'ok' : null } |
  { 'err' : string };
export interface ExternalMintRequest {
  'txid' : string,
  'user' : Principal,
  'amount' : bigint,
}
export interface ExternalRuneMintRequest {
  'tokenid' : string,
  'txid' : string,
  'user' : Principal,
  'amount' : bigint,
}
export interface ExternalToken {
  'liquidity_threshold_reached' : boolean,
  'divisibility' : bigint,
  'liquidity_threshold' : TokenAmount,
  'price' : TokenAmount,
}
export interface LiquidityPool {
  'locked' : LiquiditySwap,
  'current' : LiquiditySwap,
}
export interface LiquidityRequest {
  'tokenid' : TokenID,
  'typeof' : LiquidityType,
  'amount' : TokenAmount,
}
export type LiquidityResponse = { 'ok' : null } |
  { 'err' : string };
export interface LiquiditySwap { 'btc' : TokenAmount, 'token' : TokenAmount }
export type LiquidityType = { 'add' : null } |
  { 'remove' : null };
export interface ListRequest { 'rune_id' : string }
export type ListResponse = { 'ok' : TokenAmount } |
  { 'err' : string };
export type Metadata = Array<MetadataRecord>;
export type MetadataRecord = [
  string,
  { 'hex' : string } |
    { 'int' : bigint } |
    { 'nat' : bigint } |
    { 'principal' : Principal } |
    { 'blob' : Uint8Array | number[] } |
    { 'bool' : boolean } |
    { 'nat8' : number } |
    { 'text' : string },
];
export interface MintRequest {
  'metadata' : Metadata,
  'code' : [] | [string],
  'prebuy_amount' : [] | [TokenAmount],
}
export type MintResponse = { 'ok' : null } |
  { 'err' : string };
export interface Operation { 'time' : Time, 'typeof' : OperationType }
export interface OperationAndId { 'id' : bigint, 'operation' : Operation }
export type OperationType = { 'access' : { 'user' : string } } |
  { 'token' : { 'tokenid' : TokenID, 'deltas' : TokenDeltas } } |
  {
    'trade' : {
      'amount_token' : TokenAmount,
      'tokenid' : TokenID,
      'user' : string,
      'typeof' : TradeType,
      'bonded' : boolean,
      'amount_btc' : TokenAmount,
      'price' : TokenAmount,
    }
  } |
  { 'other' : { 'data' : Metadata, 'name' : string } } |
  { 'mint' : { 'tokenid' : TokenID, 'data' : Metadata } } |
  {
    'transaction' : {
      'tokenid' : TokenID,
      'balance' : TokenAmount,
      'metadata' : Metadata,
      'user' : string,
      'typeof' : { 'add' : null } |
        { 'sub' : null },
      'description' : string,
      'amount' : TokenAmount,
    }
  };
export type Result = { 'ok' : null } |
  { 'err' : string };
export interface Rune { 'id' : string, 'ticker' : string, 'name' : string }
export interface SwapRequest {
  'amount_from' : TokenAmount,
  'settings' : [] | [TradeSettings],
  'tokenid_to' : TokenID,
  'tokenid_from' : TokenID,
}
export type SwapResponse = { 'ok' : null } |
  { 'err' : string };
export type Time = bigint;
export interface Token {
  'creator' : Principal,
  'lp_supply' : TokenAmount,
  'bonded_btc' : TokenAmount,
  'pool' : LiquidityPool,
  'rune' : [] | [Rune],
  'bonding_threshold_reward' : TokenAmount,
  'supply' : TokenAmount,
  'icrc_canister' : [] | [Principal],
  'max_supply' : TokenAmount,
  'bonding_curve' : [] | [BondingCurveSettings],
  'bonding_threshold' : TokenAmount,
  'bonding_threshold_fee' : TokenAmount,
}
export type TokenAmount = bigint;
export type TokenDeltas = Array<
  {
    'field' : string,
    'delta' : { 'add' : TokenAmount } |
      { 'sub' : TokenAmount } |
      { 'bool' : boolean } |
      { 'text' : string } |
      { 'amount' : TokenAmount },
  }
>;
export type TokenID = string;
export type TradeAmount = { 'btc' : TokenAmount } |
  { 'token' : TokenAmount };
export interface TradeRequest {
  'tokenid' : TokenID,
  'typeof' : TradeType,
  'settings' : [] | [TradeSettings],
  'amount' : TradeAmount,
}
export type TradeResponse = { 'ok' : null } |
  { 'err' : string };
export interface TradeSettings { 'slippage' : [] | [[TokenAmount, bigint]] }
export type TradeType = { 'buy' : null } |
  { 'sell' : null };
export interface TransferRequest {
  'to' : string,
  'tokenid' : TokenID,
  'amount' : TokenAmount,
}
export type TransferResponse = { 'ok' : null } |
  { 'err' : string };
export type WithdrawProtocol = { 'btc' : null } |
  { 'ckbtc' : null } |
  { 'volt' : null };
export interface WithdrawRequest {
  'protocol' : WithdrawProtocol,
  'tokenid' : TokenID,
  'address' : string,
  'amount' : TokenAmount,
}
export type WithdrawResponse = { 'ok' : boolean } |
  { 'err' : string };
export interface _SERVICE {
  'add_fastbtc' : ActorMethod<[Principal, bigint], undefined>,
  'add_fastbtc_bulk' : ActorMethod<[Array<[Principal, bigint]>], undefined>,
  'add_fastbtc_bulk_v2' : ActorMethod<[Array<ExternalMintRequest>], undefined>,
  'add_fastbtc_v2' : ActorMethod<[ExternalMintRequest], undefined>,
  'add_fastrunes' : ActorMethod<[ExternalRuneMintRequest], undefined>,
  'add_fastrunes_bulk' : ActorMethod<
    [Array<ExternalRuneMintRequest>],
    undefined
  >,
  'admin_blacklist_user' : ActorMethod<[Principal, boolean], undefined>,
  'admin_change_user' : ActorMethod<[Principal, boolean], undefined>,
  'admin_shutdown' : ActorMethod<[boolean], undefined>,
  'admin_unlock' : ActorMethod<[TokenID], undefined>,
  'admin_update_threshold' : ActorMethod<[TokenID, TokenAmount], Result>,
  'admin_whitelist_user' : ActorMethod<[Principal, boolean], undefined>,
  'checkBlacklist' : ActorMethod<[Principal], boolean>,
  'getAdvancedStats' : ActorMethod<[], Array<[string, string]>>,
  'getBalance' : ActorMethod<[string, TokenID], TokenAmount>,
  'getBlacklist' : ActorMethod<[], Array<Principal>>,
  'getExternalToken' : ActorMethod<[TokenID], [] | [ExternalToken]>,
  'getExternalTokens' : ActorMethod<[], Array<[TokenID, ExternalToken]>>,
  'getOperation' : ActorMethod<[bigint], [] | [Operation]>,
  'getOperations' : ActorMethod<[bigint, bigint], Array<OperationAndId>>,
  'getReferrer' : ActorMethod<[string], [] | [Principal]>,
  'getStats' : ActorMethod<[], Array<[string, string]>>,
  'getToken' : ActorMethod<[TokenID], [] | [Token]>,
  'getWhitelist' : ActorMethod<[], Array<Principal>>,
  'icrc10_supported_standards' : ActorMethod<
    [],
    Array<{ 'url' : string, 'name' : string }>
  >,
  'icrc28_trusted_origins' : ActorMethod<
    [],
    { 'trusted_origins' : Array<string> }
  >,
  'register_referrer' : ActorMethod<[Principal, Principal], undefined>,
  'token_add' : ActorMethod<[AddRequest], AddResponse>,
  'token_deposit' : ActorMethod<[TokenID, TokenAmount], TokenAmount>,
  'token_etch' : ActorMethod<[EtchRequest], EtchResponse>,
  'token_liquidity' : ActorMethod<[LiquidityRequest], LiquidityResponse>,
  'token_list' : ActorMethod<[ListRequest], ListResponse>,
  'token_mint' : ActorMethod<[MintRequest], MintResponse>,
  'token_swap' : ActorMethod<[SwapRequest], SwapResponse>,
  'token_trade' : ActorMethod<[TradeRequest], TradeResponse>,
  'token_transfer' : ActorMethod<[TransferRequest], TransferResponse>,
  'token_withdraw' : ActorMethod<[WithdrawRequest], WithdrawResponse>,
  'user_claim' : ActorMethod<[], TokenAmount>,
  'withdraw_shutdown' : ActorMethod<[boolean], undefined>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];