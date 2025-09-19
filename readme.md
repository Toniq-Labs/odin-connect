# OdinConnect

### Demo

This repository includes a demo. See `demo/` folder
To run it, simply do `npm run demo`

### Initializing new instance

```typescript
const odin = new OdinConnect({ name: "Demo App" });
```

### Request for user connection

```typescript
const user = await odinConnect.connect({
  open: {
    target: "_blank",
    settings: "height=800,width=400",
  },
  requires_api: true,
});
```

### Request for user balances

```typescript
const balances = await odinConnect.getBalances({
  principal: user.principal,
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
  amount: 200_000_000n,
});
```

### Request for buy authorization

```typescript
await odinConnect.buy({
  btcAmount: 200_000_000n,
  token: "2jjj",
  principal: "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe",
});
```

### Request for sell authorization

```typescript
await odinConnect.sell({
  tokenAmount: 200_000_000n,
  token: "2jjj",
  principal: "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe",
});
```

### Request for add liquidity authorization

```typescript
await odinConnect.addLiquidity({
  btcAmount: 200_000_000n,
  token: "2jj",
  principal: "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe",
});
```

### Request for remove liquidity authorization

```typescript
await odinConnect.removeLiquidity({
  btcAmount: 200_000_000n,
  token: "2jj",
  principal: "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe",
});
```
