import { BaseToken } from "./token";

export interface Activity {
  id: number;
  token: BaseToken;
  time: Date;
  action: string;
  amount_token?: bigint;
  amount_btc?: bigint;
  description?: string;
}
