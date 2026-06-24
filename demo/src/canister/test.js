export const idlFactory = ({ IDL }) => {
  return IDL.Service({
    'deposit' : IDL.Func([IDL.Text, IDL.Nat], [IDL.Nat], []),
    'getBalance' : IDL.Func([IDL.Text], [IDL.Nat], ['query']),
    'getBalances' : IDL.Func(
        [],
        [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Nat))],
        ['query'],
      ),
    'getOwner' : IDL.Func([], [IDL.Opt(IDL.Principal)], ['query']),
    'icrc28_trusted_origins' : IDL.Func(
        [],
        [IDL.Record({ 'trusted_origins' : IDL.Vec(IDL.Text) })],
        [],
      ),
    'withdraw' : IDL.Func([IDL.Text, IDL.Nat], [IDL.Nat], []),
  });
};
export const init = ({ IDL }) => { return []; };
