export interface BaseToken {
  id: string;
  name: string;
  ticker: string;
  divisibility: number;
  decimals: number;
  withdrawals: boolean;
  deposits: boolean;
}

export interface Token extends BaseToken {
  image: string | null;
  description: string | null;
  creator: string;
  created_time: Date;
  marketcap: bigint;
  volume: bigint;
  volume_24: number;
  holder_count: number;
  power_holder_count: number;
  sell_count: number;
  buy_count: number;
  comment_count: number;
  featured: boolean;
  bonded: boolean;
  external: boolean;
  trading: boolean;
  icrc_ledger: string | null;
  sold: bigint;
  total_supply: bigint;
  threshold: bigint;
  swap_volume: bigint | null;
  swap_volume_24: bigint | null;
  holding_value: number | null;
  price: number;
  twitter: string | null;
  twitter_verified: boolean | null;
  website: string | null;
  telegram: string | null;
  btc_liquidity: bigint;
  token_liquidity: bigint;
  liquidity_threshold: bigint;
  last_comment_time: string | null;
  last_action_time: Date | null;
  user_lp_tokens: bigint;
  user_btc_liquidity: bigint;
  user_token_liquidity: bigint;
  verified: boolean;
  progress: number | null;
  price_5m: number | null;
  price_1h: number | null;
  price_6h: number | null;
  price_1d: number | null;
}

export interface TokenWithBalance {
  token: Token;
  balance: bigint;
}
