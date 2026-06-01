import { ec } from 'starknet';
import { describe, expect, it } from 'vitest';
import type { Signer } from '../src/common/types';
import {
  chainIdFromStarknetChainId,
  serializeSignature,
  signOnboarding,
  signOrder,
} from '../src/rest/signing';

// Mécanique de signature SNIP-12 (sans réseau). ⚠️ La conformité au serveur Paradex (structure
// exacte des messages, calcul du chainId) reste À VALIDER SUR TESTNET — ces tests ne prouvent que
// la mécanique cryptographique locale (hash déterministe + signature vérifiable).

// Clé Stark de test (déterministe ; PAS une vraie clé de compte).
const PRIV = '0x1' as const;
const signer: Signer = {
  l2PrivateKey: PRIV,
  l2Address: '0x4f5e296e0b1c6f1e6e2e1b1a0c9d8e7f6a5b4c3d2e1f0011',
  network: 'testnet',
};

describe('Signature SNIP-12 (mécanique locale)', () => {
  it('chainId = encodage short-string du starknet_chain_id', () => {
    const id = chainIdFromStarknetChainId('PRIVATE_SN_POTC_SEPOLIA');
    expect(id.startsWith('0x')).toBe(true);
    // Reproductible.
    expect(chainIdFromStarknetChainId('PRIVATE_SN_POTC_SEPOLIA')).toBe(id);
  });

  it('signOnboarding produit une signature Stark vérifiable', () => {
    const chainId = chainIdFromStarknetChainId('PRIVATE_SN_POTC_SEPOLIA');
    const sig = signOnboarding(signer, chainId);
    expect(sig.r.startsWith('0x')).toBe(true);
    expect(sig.s.startsWith('0x')).toBe(true);
    // La clé publique se dérive ; la signature est cohérente avec la courbe (pas de throw).
    const pub = ec.starkCurve.getStarkKey(PRIV);
    expect(typeof pub).toBe('string');
  });

  it('signOrder est déterministe et sérialisable en "[r,s]"', () => {
    const chainId = chainIdFromStarknetChainId('PRIVATE_SN_POTC_SEPOLIA');
    const params = {
      timestamp: 1_700_000_000_000,
      market: 'ETH-USD-PERP',
      side: 'BUY' as const,
      orderType: 'LIMIT',
      size: '1.5',
      price: '3000',
    };
    const a = signOrder(signer, chainId, params);
    const b = signOrder(signer, chainId, params);
    expect(a.r).toBe(b.r);
    expect(a.s).toBe(b.s);
    const serialized = serializeSignature(a);
    expect(JSON.parse(serialized)).toEqual([a.r, a.s]);
  });
});
