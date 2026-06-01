/**
 * Accusé d'une **écriture signée** Paradex sans retour plus riche (annulation, levier, marge,
 * transfert, retrait, kill-switch). On expose un type **nommé** minimal ; la réponse native
 * complète reste dans `xtras` (rien jeté).
 */
export interface Ack {
  /** `true` si Paradex a accepté l'action (statut HTTP 2xx + absence d'`error`). */
  ok: boolean;
  /** Réponse native complète (rien jeté). */
  xtras: Record<string, unknown>;
}

/** Forme native d'une réponse d'écriture Paradex (champs `error`/`message` si échec applicatif). */
export interface AckNative {
  error?: string;
  message?: string;
  [key: string]: unknown;
}

/** Convertisseur réponse d'écriture → {@link Ack} : `ok = absence d'erreur applicative`. */
export class AckConverter {
  toCommon(wire: AckNative | null): Ack {
    const obj = (wire ?? {}) as Record<string, unknown>;
    return { ok: obj.error === undefined, xtras: obj };
  }
}
