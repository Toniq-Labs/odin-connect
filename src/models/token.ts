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

export type TokenFilterFields = {
  ascended: boolean;
  etched: boolean;
  /** External: true - Launched on BitCoin; false - Launched on Odin */
  external: boolean;
  verified: boolean;
  has_website: boolean;
  has_twitter: boolean;
  has_telegram: boolean;
  marketcap_max: bigint;
  marketcap_min: bigint;
  volume_max: bigint;
  volume_min: bigint;
  holders_max: number;
  holders_min: number;
  price_max: number;
  price_min: number;
  search: string;
};

export type TokenSortableFields =
  | "created_time"
  | "marketcap"
  | "volume"
  | "power_holder_count"
  | "price"
  | "holders_count"
  | "price_delta_5m"
  | "price_delta_1h"
  | "price_delta_6h"
  | "price_delta_1d"
  | "volume_24"
  | "txn_count"
  | "ascension"
  | "last_action_time";
