import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { secp256k1 } from '@noble/curves/secp256k1';

/**
 * Helper d'environnement pour les tests **testnet réels** (aucun mock). Lit `ParadexSdk/.env`
 * (`EVM_PRIVATE_KEY` / `EVM_PUBLIC_KEY`) et fournit de quoi **skipper proprement** si le fichier est
 * absent. Fournit aussi une fabrique de **clé EVM éphémère** : chaque run de test d'écriture dérive
 * un compte L2 frais, l'onboarde et trade dessus — flux 100 % réel, sans dépendre d'un wallet déjà
 * consommé.
 */

export interface EnvCredentials {
  evmPrivateKey: `0x${string}`;
  evmAddress: `0x${string}`;
}

/** Lit et parse `ParadexSdk/.env`. Renvoie `null` si absent ou clés manquantes (→ skip propre). */
export function loadEnv(): EnvCredentials | null {
  const path = fileURLToPath(new URL('../.env', import.meta.url));
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  const map = new Map<string, string>();
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    const idx = trimmed.indexOf('=');
    if (idx === -1) {
      continue;
    }
    map.set(trimmed.slice(0, idx).trim(), trimmed.slice(idx + 1).trim());
  }
  const pk = map.get('EVM_PRIVATE_KEY');
  const addr = map.get('EVM_PUBLIC_KEY');
  if (pk === undefined || addr === undefined || !pk.startsWith('0x')) {
    return null;
  }
  return { evmPrivateKey: pk as `0x${string}`, evmAddress: addr as `0x${string}` };
}

/**
 * Génère une **clé privée EVM éphémère** (`0x` + 64 hex), aléatoire. Sert aux tests d'écriture :
 * un compte L2 frais est dérivé puis onboardé à chaque run (un wallet EVM ne peut onboarder qu'un
 * seul compte L2 sur Paradex ; on évite donc de bloquer/réutiliser le wallet du `.env`).
 */
export function randomEthPrivateKey(): `0x${string}` {
  const bytes = secp256k1.utils.randomPrivateKey();
  let hex = '';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return `0x${hex}`;
}
