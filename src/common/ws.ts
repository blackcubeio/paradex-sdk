import type { WebSocketFactory } from './config';
import type { JsonValue } from './types';

export type StreamHandler = (data: JsonValue) => void;

export type Unsubscribe = () => void;

export interface WsClientOptions {
  /** Label du signer (cf. init) : choisit le réseau du socket et l'auth des channels privés. */
  label?: string;
  url?: string;
  webSocket?: WebSocketFactory;
  /** Intervalle du ping (ms). Paradex ping serveur ~55 s, pong attendu < 5 s. Défaut 30 s. */
  heartbeatIntervalMs?: number;
}
