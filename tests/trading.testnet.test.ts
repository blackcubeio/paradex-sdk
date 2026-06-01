import { beforeAll, describe, expect, it } from 'vitest';
import { Paradex } from '../src/index';
import type { Order, Signer } from '../src/index';
import { type EnvCredentials, loadEnv } from './_env';

/**
 * **Trading signé** contre le **vrai testnet Paradex**, sur le **compte funded réel** de Philippe
 * (aucun mock).
 *
 * Le `.env` fournit le compte L2 Starknet **déjà onboardé et approvisionné** (~100 000 USDC de
 * collatéral testnet). On l'utilise **directement** (clé privée L2 + adresse du compte), **sans
 * re-onboarding** : le wallet EVM parent est déjà lié à ce compte (un re-onboarding renverrait
 * « Parent account … has been used to onboard a different account »).
 *
 * ⚠️ Détail factuel du `.env` (vérifié réseau le 2026-06-01) : `WALLET_PARADEX_MAIN_PUBLIC_KEY` est
 * l'**adresse du compte L2** (`/account.account`), **pas** la clé publique Stark. La paire
 * (`WALLET_PARADEX_MAIN_PRIVATE_KEY`, `WALLET_PARADEX_MAIN_PUBLIC_KEY`) authentifie 200 sur `/auth`.
 *
 * Flux prouvé : `/auth` (JWT) → `/balance` montre du collatéral → **ordre limite POST_ONLY (ALO)
 * loin du marché** (BTC-USD-PERP buy à ~50 % du mid) → l'ordre **reste au repos** (`/orders` →
 * status `open`) → **annulation** (`DELETE /orders/{id}`) → `/orders` ne le contient plus.
 *
 * Non destructif : un seul ordre limite loin du marché (jamais exécutable car POST_ONLY à 50 % du
 * mid), immédiatement annulé. Aucun retrait, transfert, sous-compte. Skip propre si `ParadexSdk/.env`
 * absent ou sans compte funded.
 */

const env = loadEnv();
const funded = env?.fundedL2 ?? null;
const run = funded !== null ? describe : describe.skip;

const MARKET = 'BTC-USD-PERP';
const SIZE = '0.01'; // notionnel ~ mid*0.01 ; ≥ min_notional à ~50 % du mid

/** Construit le signer du compte funded réel à partir du `.env` (sans onboarding). */
function fundedSigner(cred: NonNullable<EnvCredentials['fundedL2']>, evm: `0x${string}`): Signer {
  return {
    l2PrivateKey: cred.privateKey,
    l2Address: cred.address,
    network: 'testnet',
    ethAddress: evm,
  };
}

run('Paradex — trading signé sur le compte funded réel (testnet)', () => {
  let dex: Paradex;

  beforeAll(() => {
    const credentials = env as EnvCredentials;
    const signer = fundedSigner(
      credentials.fundedL2 as NonNullable<EnvCredentials['fundedL2']>,
      credentials.evmAddress,
    );
    dex = new Paradex({ desk: signer }, { default: 'desk' });
  });

  it('auth + balance : le compte funded répond 200 et porte du collatéral', async () => {
    const jwt = await dex.native.signing().getJwt();
    expect(jwt.split('.').length).toBe(3); // JWT accepté

    const balances = await dex.account().getBalances();
    expect(Array.isArray(balances)).toBe(true);
    const usdc = balances.find((b) => b.asset === 'USDC');
    expect(usdc).toBeDefined();
    // Compte funded : collatéral strictement positif (réel, lu sur le réseau).
    expect(Number(usdc?.total ?? '0')).toBeGreaterThan(0);
  }, 30_000);

  it('place un ordre ALO loin du marché → OPEN au repos → cancel → absent', async () => {
    // Prix loin du marché : 50 % du mid (BBO), arrondi à l'entier (tick BTC-USD-PERP = 0.1).
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
      tif: 'alo', // POST_ONLY : ne croise jamais le marché, donc reste au repos.
    });
    expect(placed.id).toBeTruthy();
    expect(placed.name).toBe(MARKET);
    expect(placed.side).toBe('buy');

    // L'ordre **repose** : on le retrouve OPEN dans /orders (preuve qu'il n'a pas été fermé).
    const opens = await dex.perp().getOpens({ name: MARKET });
    const resting = opens.find((o) => o.id === placed.id);
    expect(resting).toBeDefined();
    expect(resting?.status).toBe('open');

    // Annulation de l'ordre au repos.
    await dex.perp().cancel({ name: MARKET, id: placed.id });

    // Après annulation : l'ordre n'est plus dans les ordres ouverts.
    const opensAfter = await dex.perp().getOpens({ name: MARKET });
    expect(opensAfter.find((o) => o.id === placed.id)).toBeUndefined();
  }, 30_000);
});
