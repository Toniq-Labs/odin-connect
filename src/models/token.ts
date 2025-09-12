export interface Token {
    id: string;
    name: string;
    ticker: string;
    divisibility: number;
    withdrawals: boolean;
    deposits: boolean;
}