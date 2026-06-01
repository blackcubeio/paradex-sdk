import { beforeAll, describe, expect, it } from 'vitest';
import { Paradex, init, signerFromEthKey } from '../src/index';
import type { Signer } from '../src/index';
import { loadEnv, randomEthPrivateKey } from './_env';

/**
 * **Lectures privées signées** contre le **vrai testnet Paradex** (aucun mock).
 *
 * Flux complet et réel : on dérive un compte L2 Starknet depuis une **clé EVM éphémère** (flux
 * d'onboarding officiel `grind_key`), on **onboarde** (`POST /onboarding`), on obtient un **JWT**
 * (`POST /auth`) puis on prouve des lectures privées 200 (`/balance`, `/positions`, `/account/info`).
 *
 * Skip propre si `ParadexSdk/.env` est absent (gate : on ne lance les tests réseau que si l'env de
 * test est présent). Le compte dérivé est **frais et vide** : les listes sont vides mais les
 * endpoints répondent 200 — c'est ce qui prouve que la signature SNIP-12 + le JWT sont acceptés.
 */

const env = loadEnv();
const run = env !== null ? describe : describe.skip;

run('Paradex — lectures privées signées (testnet réel)', () => {
  let dex: Paradex;
  let signer: Signer;

  beforeAll(async () => {
    // Compte frais dérivé d'une clé EVM éphémère (un wallet EVM = un seul compte L2 sur Paradex).
    const client = init();
    signer = await signerFromEthKey(client, 'testnet', randomEthPrivateKey());
    dex = new Paradex({ desk: signer }, { default: 'desk' });
    await dex.native.signing().onboard();
  }, 30_000);

  it('onboarding a produit une adresse L2 valide', () => {
    expect(signer.l2Address.startsWith('0x')).toBe(true);
    expect(signer.network).toBe('testnet');
  });

  it('getJwt renvoie un JWT accepté', async () => {
    const jwt = await dex.native.signing().getJwt();
    expect(jwt.split('.').length).toBe(3); // header.payload.signature
  });

  it('getBalances répond 200 (liste, vide sur compte frais)', async () => {
    const balances = await dex.account().getBalances();
    expect(Array.isArray(balances)).toBe(true);
  });

  it('getPositions répond 200 (liste, vide sur compte frais)', async () => {
    const positions = await dex.perp().getPositions();
    expect(Array.isArray(positions)).toBe(true);
  });

  it('getAccountInfo répond 200 avec le compte dérivé', async () => {
    const info = (await dex.perp().getAccountInfo()) as { account?: string };
    expect(typeof info).toBe('object');
    expect(String(info.account).toLowerCase()).toBe(signer.l2Address.toLowerCase());
  });
});
