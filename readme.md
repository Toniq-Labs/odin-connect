# OdinConnect

## Installation

`npm i odin-connect`

## Demo

This repository includes a demo. See `demo/` folder

To run it, simply do `npm run demo`

## Examples

### Initializing new instance

Instantiate the OdinConnect class with some information about your application

```typescript
const odinConnect = new OdinConnect({ name: "Demo App" });
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

### Request for DelegationCain

```typescript
// create session identity
const session = Ed25519KeyIdentity.generate();

const user = await odinConnect.connect({
  // set to true
  requires_delegation: true,
  session_key: session,
  public_key: session.getPublicKey().toDer(),
  // canister ids
  targets: ["aaaa-aa"],
});

const identity = user.getIdentity();
```

### Request for user balances

```typescript
const balances = await odinConnect.getBalances({
  principal: "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe",
  pagination: { page: 1, limit: 20 },
});
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
await odinConnect.buy({
  btcAmount: 20_000_000n,
  token: "2jjj",
  principal: "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe",
});
```

### Request for sell authorization

```typescript
await odinConnect.sell({
  tokenAmount: 20_000_000n,
  token: "2jjj",
  principal: "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe",
});
```

### Request for add liquidity authorization

```typescript
await odinConnect.addLiquidity({
  btcAmount: 20_000_000n,
  token: "2jj",
  principal: "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe",
});
```

### Request for remove liquidity authorization

```typescript
await odinConnect.removeLiquidity({
  btcAmount: 20_000_000n,
  token: "2jj",
  principal: "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe",
});
```

### Request for creating new token

Note: require_api must be set set to true

```typescript
await odinConnect.createToken({
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
const tokens = await odinConnect.getTokens({
  pagination: { page: 1, limit: 50 },
  sort: { field: "marketcap", direction: "desc" },
});

// Get token info
const token = await odinConnect.getToken("2jjj");

// Get user info
const user = await odinConnect.getUser(
  "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe"
);

// Get user balance
const balances = await odinConnect.getBalances({
  principal: user.principal,
  pagination: { page: 1, limit: 20 },
});

// Get user activities
const activity = await odinConnect.getUserActivity({
  principal: "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe",
  pagination: { page: 1, limit: 10 },
});
```

### Notes

- The `principal` sent should match the currently logged in user in ODIN.
- BTC amounts are in millisatoshis
