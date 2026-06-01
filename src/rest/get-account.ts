import type { ParadexClient } from '../common/config';
import type { Balance, JsonValue, MarketKind, Order, Position, UserTrade } from '../common/types';
import { BalanceConverter, type BalanceNative } from '../converters/balance';
import {
  type FundingPayment,
  FundingPaymentConverter,
  type FundingPaymentNative,
} from '../converters/funding-payment';
import { OrderConverter, type OrderNative } from '../converters/order';
import { PositionConverter, type PositionNative } from '../converters/position';
import { type FillNative, UserTradeConverter } from '../converters/user-trade';
import { authHeaders } from './auth';
import { type QueryParams, httpGet, resolveSigner } from './client';

interface Results<T> {
  results?: T[];
}

/** Réseau du signer (lectures privées). */
function networkOf(client: ParadexClient, label?: string) {
  return resolveSigner(client, label).signer.network;
}

/** GET privé : JWT Bearer + lecture sur le réseau du signer. */
async function privateGet<T>(
  client: ParadexClient,
  label: string | undefined,
  path: string,
  query?: QueryParams,
): Promise<T> {
  const headers = await authHeaders(client, label);
  return httpGet<T>(client, path, query, label ?? Object.keys(client.signers)[0], headers);
}

/** Positions au **format unifié** (`GET /positions`). */
export async function getPositions(
  client: ParadexClient,
  label: string | undefined,
): Promise<Position[]> {
  void networkOf(client, label);
  const env = await privateGet<Results<PositionNative>>(client, label, '/positions');
  const converter = new PositionConverter();
  return (
    (env.results ?? [])
      .map((p) => converter.toCommon(p))
      // Paradex renvoie les positions historiques fermées (size 0) → on ne garde que les ouvertes.
      .filter((p) => Number(p.size) !== 0)
  );
}

/** Soldes au **format unifié** (`GET /balance`). */
export async function getBalances(
  client: ParadexClient,
  label: string | undefined,
): Promise<Balance[]> {
  const env = await privateGet<Results<BalanceNative>>(client, label, '/balance');
  const converter = new BalanceConverter();
  return (env.results ?? []).map((b) => converter.toCommon(b));
}

/** Ordres ouverts au **format unifié** (`GET /orders`, filtre `market` optionnel). */
export async function getOpenOrders(
  client: ParadexClient,
  params: { name?: string; kind: MarketKind },
  label: string | undefined,
): Promise<Order[]> {
  const env = await privateGet<Results<OrderNative>>(client, label, '/orders', {
    market: params.name,
  });
  const converter = new OrderConverter(params.kind);
  return (env.results ?? []).map((o) => converter.toCommon(o));
}

/** Historique des ordres au **format unifié** (`GET /orders-history`). */
export async function getOrderHistory(
  client: ParadexClient,
  params: { name?: string; kind: MarketKind; limit?: number },
  label: string | undefined,
): Promise<Order[]> {
  const env = await privateGet<Results<OrderNative>>(client, label, '/orders-history', {
    market: params.name,
    page_size: params.limit,
  });
  const converter = new OrderConverter(params.kind);
  return (env.results ?? []).map((o) => converter.toCommon(o));
}

/** Fills (trades du compte) au **format unifié** (`GET /fills`). */
export async function getUserTrades(
  client: ParadexClient,
  params: { name?: string; kind: MarketKind; limit?: number },
  label: string | undefined,
): Promise<UserTrade[]> {
  const env = await privateGet<Results<FillNative>>(client, label, '/fills', {
    market: params.name,
    page_size: params.limit,
  });
  const converter = new UserTradeConverter(params.kind);
  return (env.results ?? []).map((f) => converter.toCommon(f));
}

/** Paiements de funding **du compte** (`GET /funding/payments?market=`). */
export async function getFundingPayments(
  client: ParadexClient,
  params: { name: string; limit?: number },
  label: string | undefined,
): Promise<FundingPayment[]> {
  const env = await privateGet<Results<FundingPaymentNative>>(client, label, '/funding/payments', {
    market: params.name,
    page_size: params.limit,
  });
  const converter = new FundingPaymentConverter();
  return (env.results ?? []).map((p) => converter.toCommon(p));
}

/**
 * État de compte **brut** (`GET /account`) — passe-plat non normalisé (forme spécifique Paradex).
 * `unknown` assumé (cf. contrat `IProductAccount.getAccountInfo`).
 */
export function getAccountInfo(client: ParadexClient, label: string | undefined): Promise<unknown> {
  return privateGet<JsonValue>(client, label, '/account');
}

/** Liste des sous-comptes (`GET /subaccounts`). */
export async function getSubAccounts(
  client: ParadexClient,
  label: string | undefined,
): Promise<{ address: string; xtras?: Record<string, unknown> }[]> {
  const env = await privateGet<Results<Record<string, unknown>>>(client, label, '/subaccounts');
  return (env.results ?? []).map((s) => ({
    address: String(s.address ?? s.account ?? ''),
    xtras: s,
  }));
}
