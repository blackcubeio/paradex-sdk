/**
 * Coalescing + throttling des messages subscribe/unsubscribe d'une socket Paradex (JSON-RPC 2.0).
 *
 * Porté **par copie** du `SubscriptionBatcher` Lighter/Aster (pattern de référence). Paradex émet
 * **un** abonnement par message (`{ jsonrpc, method:'subscribe', params:{ channel }, id }`), donc
 * `chunk = 1`, espacé d'`intervalMs`. Sans ce throttle, un abonnement massif peut inonder la
 * connexion et la faire fermer.
 *
 * API publique **identique** aux 4 SDK : `subscribe` / `unsubscribe` / `resubscribe` / `setOpen` / `reset`.
 */
export class SubscriptionBatcher {
  private readonly pendingSub = new Set<string>();
  private readonly pendingUnsub = new Set<string>();
  private readonly outbox: string[] = [];
  private flushScheduled = false;
  private draining = false;
  private open = false;

  constructor(
    private readonly rawSend: (frame: string) => void,
    private readonly buildSub: (names: string[]) => unknown,
    private readonly buildUnsub: (names: string[]) => unknown,
    private readonly chunk = 1,
    private readonly intervalMs = 60,
  ) {}

  /** Marque un channel à souscrire (annule un unsubscribe en attente du même). */
  public subscribe(name: string): void {
    this.pendingUnsub.delete(name);
    this.pendingSub.add(name);
    this.schedule();
  }

  /** Marque un channel à désouscrire (annule un subscribe en attente du même). */
  public unsubscribe(name: string): void {
    this.pendingSub.delete(name);
    this.pendingUnsub.add(name);
    this.schedule();
  }

  /** Ré-souscrit en masse (reconnexion) : rejoue tous les channels encore suivis. */
  public resubscribe(names: Iterable<string>): void {
    for (const name of names) {
      this.pendingUnsub.delete(name);
      this.pendingSub.add(name);
    }
    this.schedule();
  }

  /** Bascule l'état de la socket : à l'ouverture, on draine la file (throttlée). */
  public setOpen(isOpen: boolean): void {
    this.open = isOpen;
    if (isOpen === true) {
      this.pump();
    }
  }

  /** Vide la file d'envoi (socket fermée) ; les channels suivis sont rejoués au reconnect. */
  public reset(): void {
    this.outbox.length = 0;
    this.draining = false;
  }

  private schedule(): void {
    if (this.flushScheduled === true) {
      return;
    }
    this.flushScheduled = true;
    queueMicrotask(() => {
      this.flushScheduled = false;
      this.flush();
    });
  }

  private flush(): void {
    this.enqueue(this.buildUnsub, this.pendingUnsub);
    this.pendingUnsub.clear();
    this.enqueue(this.buildSub, this.pendingSub);
    this.pendingSub.clear();
  }

  private enqueue(build: (names: string[]) => unknown, names: Set<string>): void {
    const all = [...names];
    for (let i = 0; i < all.length; i += this.chunk) {
      const slice = all.slice(i, i + this.chunk);
      this.outbox.push(JSON.stringify(build(slice)));
    }
    this.pump();
  }

  private pump(): void {
    if (this.draining === true || this.open === false || this.outbox.length === 0) {
      return;
    }
    this.draining = true;
    const frame = this.outbox.shift() as string;
    this.rawSend(frame);
    setTimeout(() => {
      this.draining = false;
      this.pump();
    }, this.intervalMs);
  }
}
