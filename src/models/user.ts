export interface User {
  principal: string;
  username: string;
  image: string;
  btc_wallet_address: string | null;
  created_at: Date;
  btc_deposit_address: string | null;
  rune_deposit_address: string | null;
  ref_code: string | null;
  referrer: string | null;
  admin: number;
}
