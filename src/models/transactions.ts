const transactionStatuses = [
  "pending",
  "processing",
  "complete",
  "too small",
  "error",
  "unsupported",
  "unknown",
  "delayed",
] as const;


export interface Transaction {
    id: string;
    status: typeof transactionStatuses[number];
    address: string;
    index_time: Date;
    created_time: Date;
    canister: string;
    token: string;
    amount: bigint;
}