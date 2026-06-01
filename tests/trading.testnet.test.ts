import { beforeAll, describe, expect, it } from 'vitest';
import { Paradex, init, signerFromEthKey } from '../src/index';
import type { Order, Signer } from '../src/index';
import { loadEnv, randomEthPrivateKey } from './_env';

/**
 * **Trading signé** contre le **vrai testnet Paradex** (aucun mock).
 *
 * Flux : dérivation L2 depuis une clé EVM éphémère → onboarding → JWT → **placement d'un ordre
 * limite POST_ONLY (ALO) loin du marché** (BTC-USD-PERP buy à ~50 % du mid) → le serveur doit
 * **accepter la signature SNIP-12 `Order`** (réponse avec `id`) → **annulation** (`DELETE
 * /orders/{id}`).
 *
 * Non destructif : un seul ordre limite loin du marché, immédiatement annulé. Aucun retrait,
 * transfert, sous-compte. Skip propre si `ParadexSdk/.env` absent.
 *
 * NOTE FACTUELLE (compte frais, sans collatéral) : le serveur **accepte** l'ordre (status `NEW`,
 * `id` renvoyé → la signature `Order` est validée) puis le **ferme automatiquement** côté risque
 * (`NOT_ENOUGH_MARGIN`) car le compte est vide. L'`id` renvoyé prouve l'acceptation de la signature
 * — objectif du test. L'annulation est donc tolérante : succès **ou** ordre déjà fermé.
 */

const env = loadEnv();
const run = env !== null ? describe : describe.skip;

const MARKET = 'BTC-USD-PERP';
const SIZE = '0.01'; // notionnel ~ mid*0.01 ≥ min_notional (100 USD) à ~50 % du mid

run('Paradex — trading signé (testnet réel)', () => {
  let dex: Paradex;
  let signer: Signer;

  beforeAll(async () => {
    const client = init();
    signer = await signerFromEthKey(client, 'testnet', randomEthPrivateKey());
    dex = new Paradex({ desk: signer }, { default: 'desk' });
    await dex.native.signing().onboard();
  }, 30_000);

  it('place un ordre ALO loin du marché : signature Order acceptée (id renvoyé), puis annulation', async () => {
    // Prix loin du marché : 50 % du mid (BBO), arrondi au tick (0.1 → entier suffit).
    const bbo = await dex.native.perp().getBbo({ name: MARKET });
    const bid = Number(bbo.bids[0]?.price ?? 0);
    const ask = Number(bbo.asks[0]?.price ?? 0);
    expect(bid).toBeGreaterThan(0);
    expect(ask).toBeGreaterThan(0);
    const farPrice = String(Math.round(((bid + ask) / 2) * 0.5));

    const placed: Order = await dex.perp().place({
      name: MARKET,
      side: 'buy',
      type: 'limit',
      size: SIZE,
      price: farPrice,
      tif: 'alo', // POST_ONLY
    });

    // Le serveur a accepté la signature SNIP-12 `Order` → un id d'ordre est renvoyé.
    expect(placed.id).toBeTruthy();
    expect(placed.name).toBe(MARKET);
    expect(placed.side).toBe('buy');

    // Annulation : succès si l'ordre repose encore ; toléré s'il a déjà été fermé côté risque
    // (compte frais sans collatéral → NOT_ENOUGH_MARGIN). Dans les deux cas la chaîne signée a
    // fonctionné de bout en bout.
    let cancelOk = false;
    try {
      await dex.perp().cancel({ name: MARKET, id: placed.id });
      cancelOk = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Compte frais sans collatéral : l'ordre accepté (id renvoyé) est fermé côté risque avant
      // l'annulation → message « could not find order id » / code ORDER_ID_NOT_FOUND.
      cancelOk = /not\s*find|not.?found|ORDER_ID_NOT_FOUND/i.test(message);
      if (!cancelOk) {
        throw error;
      }
    }
    expect(cancelOk).toBe(true);
  }, 30_000);
});
