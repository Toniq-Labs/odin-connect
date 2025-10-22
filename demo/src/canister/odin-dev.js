export const idlFactory = ({ IDL }) => {
  const ExternalMintRequest = IDL.Record({
    'txid' : IDL.Text,
    'user' : IDL.Principal,
    'amount' : IDL.Nat64,
  });
  const ExternalRuneMintRequest = IDL.Record({
    'tokenid' : IDL.Text,
    'txid' : IDL.Text,
    'user' : IDL.Principal,
    'amount' : IDL.Nat64,
  });
  const TokenID = IDL.Text;
  const TokenAmount = IDL.Nat;
  const Result = IDL.Variant({ 'ok' : IDL.Null, 'err' : IDL.Text });
  const ExternalToken = IDL.Record({
    'liquidity_threshold_reached' : IDL.Bool,
    'divisibility' : IDL.Nat,
    'liquidity_threshold' : TokenAmount,
    'price' : TokenAmount,
  });
  const Time = IDL.Int;
  const TokenDeltas = IDL.Vec(
    IDL.Record({
      'field' : IDL.Text,
      'delta' : IDL.Variant({
        'add' : TokenAmount,
        'sub' : TokenAmount,
        'bool' : IDL.Bool,
        'text' : IDL.Text,
        'amount' : TokenAmount,
      }),
    })
  );
  const TradeType = IDL.Variant({ 'buy' : IDL.Null, 'sell' : IDL.Null });
  const MetadataRecord = IDL.Tuple(
    IDL.Text,
    IDL.Variant({
      'hex' : IDL.Text,
      'int' : IDL.Int,
      'nat' : IDL.Nat,
      'principal' : IDL.Principal,
      'blob' : IDL.Vec(IDL.Nat8),
      'bool' : IDL.Bool,
      'nat8' : IDL.Nat8,
      'text' : IDL.Text,
    }),
  );
  const Metadata = IDL.Vec(MetadataRecord);
  const OperationType = IDL.Variant({
    'access' : IDL.Record({ 'user' : IDL.Text }),
    'token' : IDL.Record({ 'tokenid' : TokenID, 'deltas' : TokenDeltas }),
    'trade' : IDL.Record({
      'amount_token' : TokenAmount,
      'tokenid' : TokenID,
      'user' : IDL.Text,
      'typeof' : TradeType,
      'bonded' : IDL.Bool,
      'amount_btc' : TokenAmount,
      'price' : TokenAmount,
    }),
    'other' : IDL.Record({ 'data' : Metadata, 'name' : IDL.Text }),
    'mint' : IDL.Record({ 'tokenid' : TokenID, 'data' : Metadata }),
    'transaction' : IDL.Record({
      'tokenid' : TokenID,
      'balance' : TokenAmount,
      'metadata' : Metadata,
      'user' : IDL.Text,
      'typeof' : IDL.Variant({ 'add' : IDL.Null, 'sub' : IDL.Null }),
      'description' : IDL.Text,
      'amount' : TokenAmount,
    }),
  });
  const Operation = IDL.Record({ 'time' : Time, 'typeof' : OperationType });
  const OperationAndId = IDL.Record({
    'id' : IDL.Nat,
    'operation' : Operation,
  });
  const LiquiditySwap = IDL.Record({
    'btc' : TokenAmount,
    'token' : TokenAmount,
  });
  const LiquidityPool = IDL.Record({
    'locked' : LiquiditySwap,
    'current' : LiquiditySwap,
  });
  const Rune = IDL.Record({
    'id' : IDL.Text,
    'ticker' : IDL.Text,
    'name' : IDL.Text,
  });
  const BondingCurveSettings = IDL.Record({
    'a' : IDL.Float64,
    'b' : IDL.Float64,
    'c' : IDL.Float64,
    'name' : IDL.Text,
  });
  const Token = IDL.Record({
    'creator' : IDL.Principal,
    'lp_supply' : TokenAmount,
    'bonded_btc' : TokenAmount,
    'pool' : LiquidityPool,
    'rune' : IDL.Opt(Rune),
    'bonding_threshold_reward' : TokenAmount,
    'supply' : TokenAmount,
    'icrc_canister' : IDL.Opt(IDL.Principal),
    'max_supply' : TokenAmount,
    'bonding_curve' : IDL.Opt(BondingCurveSettings),
    'bonding_threshold' : TokenAmount,
    'bonding_threshold_fee' : TokenAmount,
  });
  const AddRequest = IDL.Record({
    'metadata' : Metadata,
    'rune' : Rune,
    'divisibility' : IDL.Nat,
    'liquidity_threshold' : TokenAmount,
    'supply' : TokenAmount,
    'icrc_canister' : IDL.Principal,
    'price' : TokenAmount,
  });
  const AddResponse = IDL.Variant({ 'ok' : IDL.Text, 'err' : IDL.Text });
  const EtchRequest = IDL.Record({
    'tokenid' : TokenID,
    'rune' : IDL.Text,
    'icrc_ledger' : IDL.Text,
    'rune_id' : IDL.Text,
  });
  const EtchResponse = IDL.Variant({ 'ok' : IDL.Null, 'err' : IDL.Text });
  const LiquidityType = IDL.Variant({ 'add' : IDL.Null, 'remove' : IDL.Null });
  const LiquidityRequest = IDL.Record({
    'tokenid' : TokenID,
    'typeof' : LiquidityType,
    'amount' : TokenAmount,
  });
  const LiquidityResponse = IDL.Variant({ 'ok' : IDL.Null, 'err' : IDL.Text });
  const ListRequest = IDL.Record({ 'rune_id' : IDL.Text });
  const ListResponse = IDL.Variant({ 'ok' : TokenAmount, 'err' : IDL.Text });
  const MintRequest = IDL.Record({
    'metadata' : Metadata,
    'code' : IDL.Opt(IDL.Text),
    'prebuy_amount' : IDL.Opt(TokenAmount),
  });
  const MintResponse = IDL.Variant({ 'ok' : IDL.Null, 'err' : IDL.Text });
  const TradeSettings = IDL.Record({
    'slippage' : IDL.Opt(IDL.Tuple(TokenAmount, IDL.Nat)),
  });
  const SwapRequest = IDL.Record({
    'amount_from' : TokenAmount,
    'settings' : IDL.Opt(TradeSettings),
    'tokenid_to' : TokenID,
    'tokenid_from' : TokenID,
  });
  const SwapResponse = IDL.Variant({ 'ok' : IDL.Null, 'err' : IDL.Text });
  const TradeAmount = IDL.Variant({
    'btc' : TokenAmount,
    'token' : TokenAmount,
  });
  const TradeRequest = IDL.Record({
    'tokenid' : TokenID,
    'typeof' : TradeType,
    'settings' : IDL.Opt(TradeSettings),
    'amount' : TradeAmount,
  });
  const TradeResponse = IDL.Variant({ 'ok' : IDL.Null, 'err' : IDL.Text });
  const TransferRequest = IDL.Record({
    'to' : IDL.Text,
    'tokenid' : TokenID,
    'amount' : TokenAmount,
  });
  const TransferResponse = IDL.Variant({ 'ok' : IDL.Null, 'err' : IDL.Text });
  const WithdrawProtocol = IDL.Variant({
    'btc' : IDL.Null,
    'ckbtc' : IDL.Null,
    'volt' : IDL.Null,
  });
  const WithdrawRequest = IDL.Record({
    'protocol' : WithdrawProtocol,
    'tokenid' : TokenID,
    'address' : IDL.Text,
    'amount' : TokenAmount,
  });
  const WithdrawResponse = IDL.Variant({ 'ok' : IDL.Bool, 'err' : IDL.Text });
  return IDL.Service({
    'add_fastbtc' : IDL.Func([IDL.Principal, IDL.Nat64], [], []),
    'add_fastbtc_bulk' : IDL.Func(
        [IDL.Vec(IDL.Tuple(IDL.Principal, IDL.Nat64))],
        [],
        [],
      ),
    'add_fastbtc_bulk_v2' : IDL.Func([IDL.Vec(ExternalMintRequest)], [], []),
    'add_fastbtc_v2' : IDL.Func([ExternalMintRequest], [], []),
    'add_fastrunes' : IDL.Func([ExternalRuneMintRequest], [], []),
    'add_fastrunes_bulk' : IDL.Func([IDL.Vec(ExternalRuneMintRequest)], [], []),
    'admin_blacklist_user' : IDL.Func([IDL.Principal, IDL.Bool], [], []),
    'admin_change_user' : IDL.Func([IDL.Principal, IDL.Bool], [], []),
    'admin_shutdown' : IDL.Func([IDL.Bool], [], []),
    'admin_unlock' : IDL.Func([TokenID], [], []),
    'admin_update_threshold' : IDL.Func([TokenID, TokenAmount], [Result], []),
    'admin_whitelist_user' : IDL.Func([IDL.Principal, IDL.Bool], [], []),
    'checkBlacklist' : IDL.Func([IDL.Principal], [IDL.Bool], ['query']),
    'getAdvancedStats' : IDL.Func(
        [],
        [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text))],
        [],
      ),
    'getBalance' : IDL.Func([IDL.Text, TokenID], [TokenAmount], ['query']),
    'getBlacklist' : IDL.Func([], [IDL.Vec(IDL.Principal)], ['query']),
    'getExternalToken' : IDL.Func(
        [TokenID],
        [IDL.Opt(ExternalToken)],
        ['query'],
      ),
    'getExternalTokens' : IDL.Func(
        [],
        [IDL.Vec(IDL.Tuple(TokenID, ExternalToken))],
        ['query'],
      ),
    'getOperation' : IDL.Func([IDL.Nat], [IDL.Opt(Operation)], ['query']),
    'getOperations' : IDL.Func(
        [IDL.Nat, IDL.Nat],
        [IDL.Vec(OperationAndId)],
        ['query'],
      ),
    'getReferrer' : IDL.Func([IDL.Text], [IDL.Opt(IDL.Principal)], ['query']),
    'getStats' : IDL.Func(
        [],
        [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text))],
        ['query'],
      ),
    'getToken' : IDL.Func([TokenID], [IDL.Opt(Token)], ['query']),
    'getWhitelist' : IDL.Func([], [IDL.Vec(IDL.Principal)], ['query']),
    'icrc10_supported_standards' : IDL.Func(
        [],
        [IDL.Vec(IDL.Record({ 'url' : IDL.Text, 'name' : IDL.Text }))],
        ['query'],
      ),
    'icrc28_trusted_origins' : IDL.Func(
        [],
        [IDL.Record({ 'trusted_origins' : IDL.Vec(IDL.Text) })],
        ['query'],
      ),
    'register_referrer' : IDL.Func([IDL.Principal, IDL.Principal], [], []),
    'token_add' : IDL.Func([AddRequest], [AddResponse], []),
    'token_deposit' : IDL.Func([TokenID, TokenAmount], [TokenAmount], []),
    'token_etch' : IDL.Func([EtchRequest], [EtchResponse], []),
    'token_liquidity' : IDL.Func([LiquidityRequest], [LiquidityResponse], []),
    'token_list' : IDL.Func([ListRequest], [ListResponse], []),
    'token_mint' : IDL.Func([MintRequest], [MintResponse], []),
    'token_swap' : IDL.Func([SwapRequest], [SwapResponse], []),
    'token_trade' : IDL.Func([TradeRequest], [TradeResponse], []),
    'token_transfer' : IDL.Func([TransferRequest], [TransferResponse], []),
    'token_withdraw' : IDL.Func([WithdrawRequest], [WithdrawResponse], []),
    'user_claim' : IDL.Func([], [TokenAmount], []),
    'withdraw_shutdown' : IDL.Func([IDL.Bool], [], []),
  });
};
export const init = ({ IDL }) => { return []; };