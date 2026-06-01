# Paradex — cartographie API (référence d'implémentation)

Perp DEX sur **appchain Starknet** (Paradigm). Sources : docs.paradex.trade, SDK officiels
`tradeparadex/paradex-py` (Python) et `tradeparadex/paradex.js` (`@paradex/sdk`, **JS pur**).

## Base URLs
| | URL |
|---|---|
| REST prod | `https://api.prod.paradex.trade/v1` |
| REST testnet | `https://api.testnet.paradex.trade/v1` |
| WS prod | `wss://ws.api.prod.paradex.trade/v1` (JSON-RPC 2.0) |
| WS testnet | `wss://ws.api.testnet.paradex.trade/v1` |
| Starknet RPC | via `GET /system/config` → `starknet_fullnode_rpc_url` |

## Auth / signature (SNIP-12 Stark, JS pur — `starknet` v6/8 + starkware-crypto)
- Compte **L2 Starknet** : `l2_address`, clé Stark (`0x`+64 hex). Dérivable d'une signature ETH
  (`grind_key(r)`), ou clé Paradex fournie directement.
- **chainId SNIP-12** = `int_from_bytes(starknet_chain_id ASCII)` où `starknet_chain_id` vient de
  `GET /system/config` (à fetcher, NE PAS hardcoder). Domaine = `{ name:"Paradex", chainId:hex(id), version:"1" }`.
- **Onboarding** : `POST /onboarding` — typed data `primaryType:"Constant"`, `message:{action:"Onboarding"}`.
  Headers `PARADEX-ETHEREUM-ACCOUNT`, `PARADEX-STARKNET-ACCOUNT`, `PARADEX-STARKNET-SIGNATURE`, body `{public_key,…}`.
- **JWT** : `POST /auth` — typed data `Request=[method,path,body,timestamp,expiration]`,
  `message:{method:"POST",path:"/v1/auth",body:"",timestamp,expiration}`. Headers `PARADEX-STARKNET-ACCOUNT`,
  `PARADEX-STARKNET-SIGNATURE`("[r,s]"), `PARADEX-TIMESTAMP`, `PARADEX-SIGNATURE-EXPIRATION` (def 30min, max 1 sem).
  Réponse `{jwt_token}` → `Authorization: Bearer <jwt>` sur tous les endpoints privés. Subkey via `POST /auth/{public_key}`.
- **Order** : typed data `primaryType:"Order"`, `Order=[timestamp,market,side,orderType,size,price]` :
  `timestamp`=ms epoch (nonce), `market`=short string (`ETH-USD-PERP`), `side`=1 BUY/2 SELL,
  `orderType`=short string, `size`/`price`=quantum 8 décimales (`price=0` pour MARKET à la signature).
  `ModifyOrder`=Order + `id` (felt) final.
- Lib JS : `@paradex/sdk` (deps `starknet@8`, `@starkware-industries/starkware-crypto-utils`, `bignumber.js`) → **pas de WASM**.

## Lecture marché (public)
| Donnée | path | params | réponse |
|---|---|---|---|
| Marchés | `GET /markets` | `market?` | symbol, asset_kind, tick/step, leverage, addresses |
| Summary/prix | `GET /markets/summary` | `market`(req, `ALL`), `start?`,`end?` | mark/last/index, funding, OI, volume |
| Klines | `GET /markets/klines` | `symbol`*,`resolution`*(min:1,3,5,15,30,60),`start_at`*,`end_at`*(ms),`price_kind?` | array OHLCV (ordre à confirmer testnet) |
| Orderbook | `GET /orderbook/{market}` | `depth?`(20),`price_tick?` | asks[][price,size], bids[], seq_no, last_updated_at |
| BBO | `GET /bbo/{market}` | — | bid,bid_size,ask,ask_size,seq_no |
| Trades | `GET /trades` | `market`\|`baseAsset`,`start_at?`,`end_at?`,`page_size?`(100,max1000),`cursor?` | side=côté taker |
| Funding | `GET /funding/data` | `market`*,`start_at?`,`end_at?`,`page_size?`,`cursor?` | created_at,funding_index,funding_period_hours,funding_premium |

## Compte (JWT)
`GET /account` (subaccount_address?), `/account/info`, `/account/history` (PnL), `/balance`, `/positions`,
`/fills`, `/funding/payments` (market*), `/transactions`, `/tradebusts`, `/transfers`, `/subaccounts`,
`/account/margin?market=` (leverage, margin_type CROSS/ISOLATED).

## Trading (SNIP-12 + JWT)
- `POST /orders` : market*, side*(BUY/SELL), type*(MARKET,LIMIT,STOP_LIMIT,STOP_MARKET,TAKE_PROFIT_LIMIT,
  TAKE_PROFIT_MARKET,STOP_LOSS_MARKET,STOP_LOSS_LIMIT), size*, price*, instruction*(=TIF: GTC,POST_ONLY,IOC,RPI),
  flags[](REDUCE_ONLY,STOP_CONDITION_BELOW/ABOVE_TRIGGER,…), trigger_price, client_id, stp, recv_window,
  on_behalf_of_account, signature*("[r,s]"), signature_timestamp*. Statuts NEW→OPEN→CLOSED (+UNTRIGGERED).
- `POST /orders/batch` (1–10), `DELETE /orders/{id}`, `DELETE /orders/by-client-id/{client_id}`,
  `DELETE /orders?market=` (annuler tout), `DELETE /orders/batch`, `PUT /orders/{id}` (modify, resigné),
  `GET /orders`, `GET /orders/{id}`.
- Levier/margin : `POST /account/margin/{market}` {leverage, margin_type CROSS/ISOLATED, on_behalf_of_account?}.

## WebSocket (JSON-RPC 2.0)
- subscribe: `{"jsonrpc":"2.0","method":"subscribe","params":{"channel":"<name>"},"id":N}`. Auth WS:
  `{"method":"auth","params":{"bearer":"<JWT>"}}` en premier. Ping serveur 55s → pong < 5s.
- Publics: `markets[.{m}]`, `markets_summary[.{m}]`, `bbo.{m}`, `trades.{m}`,
  `order_book.{m}.{feed}@15@{rate}[@{tick}]`, `funding_data.{m}`.
- Privés: `account`, `balance_events`, `positions`, `orders.{m}`, `fills.{m}`, `funding_payments.{m}`,
  `tradebusts`, `transaction`, `transfers`.
- Trading via WS (JSON-RPC methods): `order.create/create_batch/modify/cancel/cancel_batch/cancel_all/cancel_on_disconnect`.
  → `cancel_on_disconnect` = **kill-switch / dead-man-switch** (capacité IDeadManSwitch).

## Spécificités
- Marchés `BASE-USD-PERP` (perp), `BASE-USD` (spot). ~90+ marchés (perp, options datées, TradFi).
- `GET /system/config` (public) : starknet_chain_id, fullnode_rpc, paraclear_address, account hashes,
  bridged_tokens, paraclear_decimals — **fetch au démarrage** (chainId SNIP-12 en dépend).
- Sous-comptes (`/subaccounts`, `on_behalf_of_account`), vaults (`/vaults/*`), STP, RPI, recv_window.

## À confirmer testnet
- Ordre exact des colonnes OHLCV de `/markets/klines`.
- Valeur littérale `starknet_chain_id` prod/testnet (fetch system/config).
- Paths précis `/markets/settlement-price`, `/markets/impact`.
