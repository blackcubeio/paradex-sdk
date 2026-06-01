import type { ParadexClient, WebSocketFactory, WebSocketLike } from '../common/config';
import type { JsonValue, Network } from '../common/types';
import type { StreamHandler, Unsubscribe, WsClientOptions } from '../common/ws';
import { SubscriptionBatcher } from './subscription-batcher';

// ── Robustesse WS : constantes communes aux 4 SDK (mêmes noms, mêmes valeurs) ─────────────────
const RECONNECT_BASE_MS = 500;
const RECONNECT_FACTOR = 2;
const RECONNECT_CAP_MS = 30_000;
const RECONNECT_JITTER = 0.2;
const RECONNECT_STABLE_MS = 10_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const IDLE_TIMEOUT_MS = 45_000;
const REQUEST_TIMEOUT_MS = 30_000;
const WS_SUB_INTERVAL_MS = 60;

/** `WebSocket.OPEN` (readyState). */
const OPEN = 1;

/** Abonnement vivant ré-jouable au reconnect (clé = channel). */
interface ActiveSubscription {
  channel: string;
}

/** Requête JSON-RPC en vol (résolue par `id`). */
interface PendingRequest {
  resolve: (value: JsonValue) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Client WebSocket **JSON-RPC 2.0** Paradex (un endpoint `wss://…/v1`). **Lazy** : la socket s'ouvre
 * au 1er abonnement et se ferme au dernier (ref-counting par channel). Trois familles de messages :
 * - `subscribe`/`unsubscribe` → dispatch par `params.channel` des notifications `subscription` ;
 * - `auth` (bearer JWT) émis en premier ;
 * - requêtes JSON-RPC à réponse (`order.create`, `order.cancel_on_disconnect`…) corrélées par `id`.
 *
 * Robustesse (spec commune 0.7.0) : reconnexion backoff exponentiel + jitter + cap, reset du compteur
 * après stabilité, re-subscribe automatique, heartbeat (`ping`) + idle-timeout, rejet des requêtes en
 * vol au close + timeout par requête, parsing JSON défensif. La mécanique est interne : l'API publique
 * (`subscribe`/`Unsubscribe`/`request`/`auth`) ne change pas.
 */
export class ParadexWsClient {
  private readonly url: string;
  private readonly factory: WebSocketFactory;
  private socket: WebSocketLike | null = null;
  private open = false;
  private pending: string[] = [];
  private readonly handlers = new Map<string, Set<StreamHandler>>();
  private readonly activeSubscriptions = new Map<string, ActiveSubscription>();
  private readonly batcher: SubscriptionBatcher;
  private readonly heartbeatIntervalMs: number;
  private requestId = 0;
  private readonly pendingRequests = new Map<number, PendingRequest>();
  /** Bearer courant (réinjecté en auth après reconnexion). */
  private bearer: string | null = null;

  // ── Cycle de vie / robustesse ──
  private shouldReconnect = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private lastMessageAt = 0;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;

  public onError: ((error: unknown) => void) | null = null;
  public onClose: (() => void) | null = null;
  public onReconnect: (() => void) | null = null;
  public onMessage: ((message: JsonValue) => void) | null = null;

  constructor(client: ParadexClient, options: WsClientOptions = {}) {
    const network: Network =
      options.label !== undefined
        ? (client.signers[options.label]?.network ?? 'mainnet')
        : 'mainnet';
    this.url = options.url ?? client.wsUrls[network];
    this.factory = options.webSocket ?? client.webSocket;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
    this.batcher = new SubscriptionBatcher(
      (frame) => this.rawSend(frame),
      (names) => this.buildFrame('subscribe', names[0] ?? ''),
      (names) => this.buildFrame('unsubscribe', names[0] ?? ''),
      1,
      WS_SUB_INTERVAL_MS,
    );
  }

  /** Frame JSON-RPC subscribe/unsubscribe d'un channel. */
  private buildFrame(
    method: 'subscribe' | 'unsubscribe',
    channel: string,
  ): Record<string, unknown> {
    return { jsonrpc: '2.0', method, params: { channel }, id: ++this.requestId };
  }

  /** Renseigne/rafraîchit le bearer JWT (réémis en `auth` à la connexion et au reconnect). */
  public setBearer(bearer: string): void {
    this.bearer = bearer;
    if (this.open) {
      this.sendAuth();
    }
  }

  /** Émet la frame d'authentification JSON-RPC (`method:'auth'`). */
  private sendAuth(): void {
    if (this.bearer !== null) {
      this.send({
        jsonrpc: '2.0',
        method: 'auth',
        params: { bearer: this.bearer },
        id: ++this.requestId,
      });
    }
  }

  /** Abonne `handler` à `channel`. Ouvre la socket si nécessaire. */
  subscribe(channel: string, handler: StreamHandler): Unsubscribe {
    let set = this.handlers.get(channel);
    if (set === undefined) {
      set = new Set();
      this.handlers.set(channel, set);
      this.activeSubscriptions.set(channel, { channel });
      this.ensureOpen();
      this.batcher.subscribe(channel);
    }
    set.add(handler);

    return () => {
      const current = this.handlers.get(channel);
      if (current === undefined) {
        return;
      }
      current.delete(handler);
      if (current.size === 0) {
        this.handlers.delete(channel);
        this.activeSubscriptions.delete(channel);
        this.batcher.unsubscribe(channel);
        if (this.handlers.size === 0) {
          this.close();
        }
      }
    };
  }

  /**
   * Requête JSON-RPC à réponse (trading WS, kill-switch). `params` est le corps de la méthode.
   * Garde la socket ouverte tant que la promesse n'est pas résolue (ouverture lazy si besoin).
   */
  request<TResult extends JsonValue = JsonValue>(
    method: string,
    params: Record<string, unknown>,
  ): Promise<TResult> {
    this.ensureOpen();
    const id = ++this.requestId;
    return new Promise<TResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('WebSocket : délai dépassé en attente de la réponse'));
      }, REQUEST_TIMEOUT_MS);
      this.pendingRequests.set(id, {
        resolve: resolve as (value: JsonValue) => void,
        reject,
        timer,
      });
      this.send({ jsonrpc: '2.0', method, params, id });
    });
  }

  private ensureOpen(): void {
    if (this.socket === null) {
      this.connect();
    }
  }

  private connect(): void {
    if (this.socket !== null) {
      return;
    }
    this.shouldReconnect = true;
    const socket = this.factory(this.url);
    this.socket = socket;
    socket.onopen = () => {
      this.open = true;
      this.batcher.setOpen(true);
      this.sendAuth();
      const buffered = this.pending;
      this.pending = [];
      for (const message of buffered) {
        socket.send(message);
      }
      this.startHeartbeat();
      this.bumpIdle();
      this.stableTimer = setTimeout(() => {
        this.reconnectAttempts = 0;
        this.stableTimer = null;
      }, RECONNECT_STABLE_MS);
    };
    socket.onmessage = (event) => {
      this.dispatch(event.data);
    };
    socket.onclose = () => {
      this.handleClose();
    };
    socket.onerror = (error) => {
      if (this.onError !== null) {
        this.onError(error);
      }
      this.rejectAllPending('WebSocket fermé : requête en vol annulée');
    };
  }

  private handleClose(): void {
    this.stopHeartbeat();
    this.stopIdleTimer();
    if (this.stableTimer !== null) {
      clearTimeout(this.stableTimer);
      this.stableTimer = null;
    }
    this.open = false;
    this.socket = null;
    this.batcher.setOpen(false);
    this.batcher.reset();
    this.rejectAllPending('WebSocket fermé : requête en vol annulée');
    if (this.onClose !== null) {
      this.onClose();
    }
    if (this.shouldReconnect === true) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.shouldReconnect === false || this.reconnectTimer !== null) {
      return;
    }
    const capped = Math.min(
      RECONNECT_BASE_MS * RECONNECT_FACTOR ** this.reconnectAttempts,
      RECONNECT_CAP_MS,
    );
    const jitter = capped * RECONNECT_JITTER * (2 * Math.random() - 1);
    const delay = Math.max(0, Math.round(capped + jitter));
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      try {
        this.connect();
        this.afterReconnect();
      } catch (error) {
        if (this.onError !== null) {
          this.onError(error);
        }
        this.scheduleReconnect();
      }
    }, delay);
  }

  private afterReconnect(): void {
    this.batcher.resubscribe(this.activeSubscriptions.keys());
    if (this.onReconnect !== null) {
      this.onReconnect();
    }
  }

  // ── Heartbeat + idle-timeout ──

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      // Paradex ping serveur ~55 s ; on émet un ping applicatif JSON-RPC en complément.
      this.send({ jsonrpc: '2.0', method: 'ping', params: {}, id: ++this.requestId });
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private bumpIdle(): void {
    this.lastMessageAt = Date.now();
    this.stopIdleTimer();
    this.idleTimer = setTimeout(() => {
      if (Date.now() - this.lastMessageAt >= IDLE_TIMEOUT_MS) {
        this.forceReconnect();
      }
    }, IDLE_TIMEOUT_MS);
  }

  private stopIdleTimer(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private forceReconnect(): void {
    if (this.socket !== null) {
      this.socket.close();
    }
  }

  private rejectAllPending(reason: string): void {
    if (this.pendingRequests.size === 0) {
      return;
    }
    const error = new Error(reason);
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  private rawSend(message: string): void {
    if (this.open && this.socket !== null && this.socket.readyState === OPEN) {
      this.socket.send(message);
    } else {
      this.pending.push(message);
    }
  }

  private send(payload: Record<string, unknown>): void {
    this.rawSend(JSON.stringify(payload));
  }

  private dispatch(raw: unknown): void {
    this.bumpIdle();
    let message: JsonValue;
    try {
      message = JSON.parse(String(raw)) as JsonValue;
    } catch {
      if (this.onError !== null) {
        this.onError(new Error('WebSocket : message JSON illisible ignoré'));
      }
      return;
    }
    if (this.onMessage !== null) {
      this.onMessage(message);
    }
    if (message === null || typeof message !== 'object' || Array.isArray(message)) {
      return;
    }
    // Réponse à une requête corrélée par `id`.
    const id = message.id;
    if (typeof id === 'number' && this.pendingRequests.has(id)) {
      const pending = this.pendingRequests.get(id);
      if (pending !== undefined) {
        this.pendingRequests.delete(id);
        clearTimeout(pending.timer);
        if (message.error !== undefined && message.error !== null) {
          pending.reject(new Error(JSON.stringify(message.error)));
        } else {
          pending.resolve(message.result ?? null);
        }
      }
      return;
    }
    // Notification de souscription : `{ method:'subscription', params:{ channel, data } }`.
    const params = message.params;
    if (
      message.method === 'subscription' &&
      params !== null &&
      typeof params === 'object' &&
      !Array.isArray(params)
    ) {
      const channel = params.channel;
      if (typeof channel === 'string') {
        const set = this.handlers.get(channel) ?? this.matchWildcard(channel);
        if (set !== undefined) {
          for (const handler of set) {
            handler(params.data ?? params);
          }
        }
      }
    }
  }

  /**
   * Certains channels Paradex sont paramétrés (`order_book.{m}.{feed}@15@{rate}`) : le channel
   * d'abonnement = celui des notifications. Ce fallback gère un éventuel écart de suffixe en
   * matchant par préfixe sur les channels actifs.
   */
  private matchWildcard(channel: string): Set<StreamHandler> | undefined {
    for (const [key, set] of this.handlers) {
      if (channel === key || channel.startsWith(`${key.split('@')[0]}`)) {
        if (key.includes(channel) || channel.startsWith(key.split('@')[0] ?? key)) {
          return set;
        }
      }
    }
    return undefined;
  }

  /** Ferme la socket et purge l'état (appelé au dernier unsubscribe). Désactive la reconnexion. */
  close(): void {
    this.shouldReconnect = false;
    this.stopHeartbeat();
    this.stopIdleTimer();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.stableTimer !== null) {
      clearTimeout(this.stableTimer);
      this.stableTimer = null;
    }
    this.reconnectAttempts = 0;
    this.rejectAllPending('WebSocket fermé : requête en vol annulée');
    if (this.socket !== null) {
      this.socket.close();
      this.socket = null;
    }
    this.open = false;
    this.pending = [];
    this.handlers.clear();
    this.activeSubscriptions.clear();
    this.batcher.setOpen(false);
    this.batcher.reset();
  }
}
