import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export interface _SERVICE {
  'deposit' : ActorMethod<[string, bigint], bigint>,
  'getBalance' : ActorMethod<[string], bigint>,
  'getBalances' : ActorMethod<[], Array<[string, bigint]>>,
  'getOwner' : ActorMethod<[], [] | [Principal]>,
  'icrc28_trusted_origins' : ActorMethod<
    [],
    { 'trusted_origins' : Array<string> }
  >,
  'withdraw' : ActorMethod<[string, bigint], bigint>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
