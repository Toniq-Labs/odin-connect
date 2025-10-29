# OdinConnect

## Installation

`npm i odin-connect`

## Demo

This repository includes a demo. See `/demo` folder

To run it, simply do `npm run demo`

## Examples

### Initializing new instance

Instantiate the OdinConnect class with some information about your application

- `name` - Name of your app
- `env` - Odin Environment. Accepted values: `prod`, `dev`, `local`. Default: `prod`.

```typescript
const odinConnect = new OdinConnect({ name: "Demo App", env: "prod" });
```

### Request for user connection

```typescript
const user = await odinConnect.connect({
  // these will be used when window.open is called
  open: {
    target: "_blank",
    settings: "height=800,width=400",
  },
  // flag to determine if api key is being requested
  requires_api: true,
  // flag ot determine if DelegationChain is being requested
  requires_delegation: false,
});
```

### Request for Identity

```typescript
const user = await odinConnect.connect({
  // set to true
  requires_delegation: true,
  // canister ids
  targets: ["aaaa-aa"],
});
const identity = user.getIdentity();
```

### Request for various user data from API

```typescript
// get balances
const balances = await user.getBalances({ page: 1, limit: 10 });
// get tokens
const tokens = await user.getTokens({ page: 1, limit: 10 });
// get created tokens
const createdTokens = await user.getCreatedTokens({ page: 1, limit: 10 });
// get liquidity
const liquidity = await user.getLiquidity({ page: 1, limit: 10 });
// get activity
const activity = await user.getActivity({ page: 1, limit: 10 });
// get achievements
const achievements = await user.getAchievements({ page: 1, limit: 10 });
// get transactions
const transactions = await user.getTransactions({ page: 1, limit: 10 });
```

### Request for token transfer

```typescript
await odinConnect.transfer({
  principal: "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe",
  destination:
    "vv5jb-7sm7u-vn3nq-6nflf-dghis-fd7ji-cx764-xunni-zosog-eqvpw-oae",
  token: "2jjj",
  amount: 20_000_000n, // 20K sats in millisats
});
```

### Request for buy authorization

```typescript
const user = await odinConnect.connect();
await user.buy({
  btcAmount: 10_000_000n,
  token: "2jjj",
});
```

### Request for sell authorization

```typescript
const user = await odinConnect.connect();
await user.sell({
  tokenAmount: 20_000_000n,
  token: "2jjj",
});
```

### Request for add liquidity authorization

```typescript
const user = await odinConnect.connect();
await user.addLiquidity({
  btcAmount: 20_000_000n,
  token: "2jj",
});
```

### Request for remove liquidity authorization

```typescript
const user = await odinConnect.connect();
await user.removeLiquidity({
  btcAmount: 20_000_000n,
  token: "2jj",
});
```

### Request for creating new token

Note: `require_api` must be set set to true

```typescript
const user = await odinConnect.connect({ requires_api: true });
await user.createToken({
  image: file, // instance of a file
  principal: "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe",
  name: "Test Token",
  ticker: "TEST",
  description: "Test Description", // optional
  website: "http://test-website.com", // optional
  telegram: "", // optional
  twitter: "", // optional
  buy: 20_000_000n, // 20K sats
  discount: "",
});
```

### API Methods

```typescript
// Get tokens
const tokens = await odinConnect.api.getTokens({
  pagination: { page: 1, limit: 50 },
  sort: { field: "marketcap", direction: "desc" },
});

// Get activities
const activity = await odinConnect.api.getUserActivity({
  pagination: { page: 1, limit: 10 },
});

// Get token by id
const token = await odinConnect.api.getToken("2jjj");

// Get user data by id
const user = await odinConnect.api.getUser(
  "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe"
);

// Get user balance by user id
const balances = await odinConnect.api.getBalances(
  "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe",
  { page: 1, limit: 20 }
);

// Get activities by  user id
const activity = await odinConnect.api.getUserActivity(
  "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe",
  { page: 1, limit: 10 }
);

// Get transactions by user id
const transactions = await odinConnecct.api.getUserTransactions(
  "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe",
  {
    page: 1,
    limit: 10,
  }
);

// Get user stats
const stats = await odin.api.getUserStats(
  "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe"
);
```

## General Notes

- BTC amounts are in millisatoshis
