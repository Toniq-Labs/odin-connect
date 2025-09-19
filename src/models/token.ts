export interface Token {
  id: string;
  name: string;
  ticker: string;
  divisibility: number;
  decimals: number;
  withdrawals: boolean;
  deposits: boolean;
}
