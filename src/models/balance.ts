import { Token } from "./token";

export interface Balance extends Token {
  principal: string;
  balance: bigint;
}