import type { Network } from './types';

/** URLs REST de base par réseau (suffixe `/v1`). */
export const REST_URLS: Record<Network, string> = {
  mainnet: 'https://api.prod.paradex.trade/v1',
  testnet: 'https://api.testnet.paradex.trade/v1',
};

/** URLs WebSocket (JSON-RPC 2.0) par réseau. */
export const WS_URLS: Record<Network, string> = {
  mainnet: 'wss://ws.api.prod.paradex.trade/v1',
  testnet: 'wss://ws.api.testnet.paradex.trade/v1',
};
