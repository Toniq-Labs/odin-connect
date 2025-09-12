export interface User {
  principal: string;
  username: string;
  image: string;
  btc_deposit_address: string | null;
  rune_deposit_address: string | null;
  ref_code: string | null;
  admin: number
}