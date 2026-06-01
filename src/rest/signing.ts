import { ec, shortString, typedData as snip12 } from 'starknet';
import type { ParadexClient } from '../common/config';
import type { Network, Signer } from '../common/types';
import { httpGet } from './client';

/**
 * Signature **SNIP-12** (typed data Starknet) + flux JWT/onboarding Paradex — **JS pur** via
 * `starknet` (`typedData.getMessageHash` + `ec.starkCurve.sign`), pas de WASM.
 *
 * ⚠️ **À VALIDER SUR TESTNET** : les structures typées (domaine, `Constant`/`Request`/`Order`) sont
 * codées d'après `doc/API-RESEARCH.md` et le SDK officiel `@paradex/sdk`/`paradex-py`, mais n'ont pas
 * encore été confrontées au serveur Paradex (pas de credentials). Le calcul du `chainId` (int des
 * octets ASCII de `starknet_chain_id` lu via `GET /system/config`) doit notamment être vérifié.
 */

// ── system/config (chainId SNIP-12) ───────────────────────────────────────────

/** Sous-ensemble lu de `GET /system/config` (le reste est ignoré, pas typé exhaustivement). */
export interface SystemConfig {
  starknet_chain_id: string;
  starknet_fullnode_rpc_url?: string;
  paraclear_address?: string;
  [key: string]: unknown;
}

/**
 * Récupère (et **cache** par réseau) le `system/config`. Le `chainId` SNIP-12 en dépend : c'est
 * l'`int` des octets ASCII de `starknet_chain_id` (ex. `"PRIVATE_SN_POTC_SEPOLIA"`), **jamais
 * hardcodé**.
 */
export async function getSystemConfig(
  client: ParadexClient,
  network: Network,
): Promise<SystemConfig> {
  const cached = client.systemConfig[network];
  if (cached !== undefined) {
    return cached as SystemConfig;
  }
  const config = await httpGet<SystemConfig>(client, '/system/config', undefined, undefined);
  // Lecture forcée sur le réseau demandé (httpGet sans label = mainnet) : on tape l'URL du réseau.
  const onNetwork = network === 'mainnet' ? config : await fetchConfigOn(client, network);
  client.systemConfig[network] = onNetwork as Record<string, unknown>;
  return onNetwork;
}

/** Lecture du config sur un réseau précis (l'helper httpGet sans label tape mainnet). */
function fetchConfigOn(client: ParadexClient, network: Network): Promise<SystemConfig> {
  const url = `${client.restUrls[network]}/system/config`;
  return client
    .fetch(url, { method: 'GET', headers: { Accept: 'application/json' } })
    .then((r) => r.text())
    .then((body) => JSON.parse(body) as SystemConfig);
}

/**
 * `chainId` SNIP-12 = `int_from_bytes(ASCII(starknet_chain_id))`. On encode la *short string*
 * Starknet : `shortString.encodeShortString` renvoie `0x…` (felt) → c'est exactement l'entier des
 * octets ASCII. On le rend en **hex** pour le domaine SNIP-12.
 */
export function chainIdFromStarknetChainId(starknetChainId: string): string {
  return shortString.encodeShortString(starknetChainId);
}

// ── Domaine SNIP-12 + signature brute ─────────────────────────────────────────

/** Domaine SNIP-12 Paradex : `{ name:"Paradex", chainId, version:"1" }`. */
function domain(chainId: string): { name: string; chainId: string; version: string } {
  return { name: 'Paradex', chainId, version: '1' };
}

const DOMAIN_TYPE = {
  StarkNetDomain: [
    { name: 'name', type: 'felt' },
    { name: 'chainId', type: 'felt' },
    { name: 'version', type: 'felt' },
  ],
};

/** Signature Stark `[r, s]` (hex) d'un hash de message SNIP-12. */
export interface StarkSignature {
  r: string;
  s: string;
}

/** Sérialise une signature en `"[r,s]"` (forme attendue par les headers / champs Paradex). */
export function serializeSignature(sig: StarkSignature): string {
  return `["${sig.r}","${sig.s}"]`;
}

/**
 * Hash SNIP-12 d'un message typé pour `account`, puis signature Stark avec `privateKey`. Cœur
 * commun à l'onboarding, à l'auth (JWT) et aux ordres.
 */
export function signTypedData(
  privateKey: `0x${string}`,
  account: `0x${string}`,
  types: Record<string, { name: string; type: string }[]>,
  primaryType: string,
  message: Record<string, unknown>,
  chainId: string,
): StarkSignature {
  const typed = {
    domain: domain(chainId),
    primaryType,
    types: { ...DOMAIN_TYPE, ...types },
    message,
  };
  const hash = snip12.getMessageHash(typed, account);
  const signature = ec.starkCurve.sign(hash, privateKey);
  return { r: `0x${signature.r.toString(16)}`, s: `0x${signature.s.toString(16)}` };
}

// ── Messages typés Paradex ─────────────────────────────────────────────────────

/** Onboarding : `primaryType:"Constant"`, `message:{ action:"Onboarding" }`. */
export function signOnboarding(signer: Signer, chainId: string): StarkSignature {
  return signTypedData(
    signer.l2PrivateKey,
    signer.l2Address,
    { Constant: [{ name: 'action', type: 'felt' }] },
    'Constant',
    { action: 'Onboarding' },
    chainId,
  );
}

/**
 * Auth (JWT) : `primaryType:"Request"`, `message:{ method, path, body, timestamp, expiration }`.
 * `timestamp`/`expiration` en **secondes** epoch. `body` = `""` (POST /auth sans corps signé).
 */
export function signAuth(
  signer: Signer,
  chainId: string,
  timestamp: number,
  expiration: number,
): StarkSignature {
  return signTypedData(
    signer.l2PrivateKey,
    signer.l2Address,
    {
      Request: [
        { name: 'method', type: 'felt' },
        { name: 'path', type: 'felt' },
        { name: 'body', type: 'felt' },
        { name: 'timestamp', type: 'felt' },
        { name: 'expiration', type: 'felt' },
      ],
    },
    'Request',
    {
      method: 'POST',
      path: '/v1/auth',
      body: '',
      timestamp: String(timestamp),
      expiration: String(expiration),
    },
    chainId,
  );
}

/** Paramètres de signature d'un ordre (quantités déjà en chaînes décimales). */
export interface OrderSignParams {
  /** Timestamp ms epoch (sert de **nonce** / `signature_timestamp`). */
  timestamp: number;
  /** Short string marché, ex. `ETH-USD-PERP`. */
  market: string;
  /** `'BUY' | 'SELL'` (mappé en `1`/`2`). */
  side: 'BUY' | 'SELL';
  /** Short string type d'ordre natif, ex. `LIMIT`, `MARKET`, `STOP_LIMIT`. */
  orderType: string;
  /** Taille (chaîne décimale). */
  size: string;
  /** Prix (chaîne décimale ; `"0"` pour MARKET à la signature). */
  price: string;
}

/** Quantum 8 décimales : Paradex signe `size`/`price` quantifiés à 8 décimales. */
const ORDER_QUANTUM_DECIMALS = 8;

function quantize(value: string): string {
  const negative = value.startsWith('-');
  const abs = negative ? value.slice(1) : value;
  const [intPart, fracPart = ''] = abs.split('.');
  const frac = `${fracPart}${'0'.repeat(ORDER_QUANTUM_DECIMALS)}`.slice(0, ORDER_QUANTUM_DECIMALS);
  const q = BigInt(`${intPart || '0'}${frac}`);
  return (negative ? -q : q).toString();
}

/**
 * Ordre : `primaryType:"Order"`, `Order=[timestamp,market,side,orderType,size,price]`. `side` =
 * `1` (BUY) / `2` (SELL) ; `size`/`price` quantifiés à 8 décimales. Pour une **modification**
 * (`ModifyOrder`), on ajoute `id` (felt) en fin — utiliser {@link signModifyOrder}.
 */
export function signOrder(
  signer: Signer,
  chainId: string,
  params: OrderSignParams,
): StarkSignature {
  const key = signer.subkeyPrivateKey ?? signer.l2PrivateKey;
  return signTypedData(
    key,
    signer.l2Address,
    {
      Order: [
        { name: 'timestamp', type: 'felt' },
        { name: 'market', type: 'felt' },
        { name: 'side', type: 'felt' },
        { name: 'orderType', type: 'felt' },
        { name: 'size', type: 'felt' },
        { name: 'price', type: 'felt' },
      ],
    },
    'Order',
    {
      timestamp: String(params.timestamp),
      market: params.market,
      side: params.side === 'BUY' ? '1' : '2',
      orderType: params.orderType,
      size: quantize(params.size),
      price: quantize(params.price),
    },
    chainId,
  );
}

/** Modification : `ModifyOrder = Order + id` (felt en fin). */
export function signModifyOrder(
  signer: Signer,
  chainId: string,
  params: OrderSignParams & { id: string },
): StarkSignature {
  const key = signer.subkeyPrivateKey ?? signer.l2PrivateKey;
  return signTypedData(
    key,
    signer.l2Address,
    {
      ModifyOrder: [
        { name: 'timestamp', type: 'felt' },
        { name: 'market', type: 'felt' },
        { name: 'side', type: 'felt' },
        { name: 'orderType', type: 'felt' },
        { name: 'size', type: 'felt' },
        { name: 'price', type: 'felt' },
        { name: 'id', type: 'felt' },
      ],
    },
    'ModifyOrder',
    {
      timestamp: String(params.timestamp),
      market: params.market,
      side: params.side === 'BUY' ? '1' : '2',
      orderType: params.orderType,
      size: quantize(params.size),
      price: quantize(params.price),
      id: params.id,
    },
    chainId,
  );
}
