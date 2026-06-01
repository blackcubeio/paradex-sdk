import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { ec, hash } from 'starknet';
import type { ParadexClient } from '../common/config';
import type { Network, Signer } from '../common/types';
import { getSystemConfig } from './signing';

/**
 * Dérivation du **compte L2 Starknet** Paradex depuis une **clé privée EVM** (flux *Starknet v1*,
 * proxy Cairo 0). Aligné sur le SDK officiel `paradex-py` (`account/utils.py`) et `@paradex/sdk`
 * (`Account.fromEthSigner`) :
 *
 * 1. la clé EVM signe (EIP-712) le message **STARK Key** — domaine `{ name:"Paradex",
 *    version:"1", chainId:<l1_chain_id> }`, type `Constant`, message `{ action:"STARK Key" }` ;
 * 2. la composante `r` de la signature est **grindée** (`grind_key`) → **clé privée L2** Stark ;
 * 3. l'adresse L2 = `compute_address` du **compte proxy** : `class_hash = paraclear_account_proxy_hash`,
 *    `salt = clé publique Stark`, `calldata = [paraclear_account_hash, selector("initialize"), 2,
 *    pub, 0]`.
 *
 * ⚠️ Ne couvre **pas** le flux *EVM-native* (Argent v0.5.0 Cairo 1, `/v2/onboarding` + SIWE), qui
 * signe directement en secp256k1 — Paradex distingue les deux familles de comptes.
 *
 * **Validé testnet (2026-06-01)** : compte fraîchement dérivé → onboarding 200, JWT 200, lectures
 * privées 200, ordre `POST /orders` accepté (201 `NEW`). Cf. `tests/trading.testnet.test.ts`.
 */

const TEXT = new TextEncoder();

function keccakUtf8(value: string): Uint8Array {
  return keccak_256(TEXT.encode(value));
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** `BigInt` → octets big-endian sur 32 (encodage `uint256` EIP-712). */
function uint256Bytes(value: bigint): Uint8Array {
  const hex = value.toString(16).padStart(64, '0');
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function toHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) {
    s += b.toString(16).padStart(2, '0');
  }
  return s;
}

/**
 * Hash EIP-712 du message **STARK Key** Paradex.
 * `domain = { name:"Paradex", version:"1", chainId:l1ChainId }`, `Constant(string action)`,
 * `message = { action:"STARK Key" }`. `l1ChainId` = `l1_chain_id` de `GET /system/config`
 * (Sepolia `11155111` en testnet), **jamais hardcodé**.
 */
function starkKeyMessageHash(l1ChainId: number): Uint8Array {
  const domainTypeHash = keccakUtf8('EIP712Domain(string name,string version,uint256 chainId)');
  const domainHash = keccak_256(
    concatBytes(
      domainTypeHash,
      keccakUtf8('Paradex'),
      keccakUtf8('1'),
      uint256Bytes(BigInt(l1ChainId)),
    ),
  );
  const constantTypeHash = keccakUtf8('Constant(string action)');
  const messageHash = keccak_256(concatBytes(constantTypeHash, keccakUtf8('STARK Key')));
  return keccak_256(concatBytes(new Uint8Array([0x19, 0x01]), domainHash, messageHash));
}

/** Adresse EVM (checksum/lowercase) depuis une clé privée EVM (`0x` + 64 hex). */
export function ethAddressFromPrivateKey(ethPrivateKey: `0x${string}`): `0x${string}` {
  const pub = secp256k1.getPublicKey(ethPrivateKey.slice(2), false); // non compressée (0x04 …)
  const hashed = keccak_256(pub.slice(1)); // on retire le préfixe 0x04
  return `0x${toHex(hashed.slice(-20))}`;
}

/** Clé privée Stark L2 = `grind_key(r)` où `r` est la composante de la signature EIP-712. */
export function l2PrivateKeyFromEth(
  ethPrivateKey: `0x${string}`,
  l1ChainId: number,
): `0x${string}` {
  const digest = starkKeyMessageHash(l1ChainId);
  const signature = secp256k1.sign(digest, ethPrivateKey.slice(2));
  const rHex = signature.r.toString(16).padStart(64, '0');
  return `0x${ec.starkCurve.grindKey(`0x${rHex}`)}`;
}

/**
 * Adresse du compte L2 (proxy Cairo 0) depuis la clé publique Stark.
 * `compute_address(class_hash = proxyHash, salt = pub, calldata = [accountHash,
 * selector("initialize"), 2, pub, 0], deployer = 0)`.
 */
export function l2AddressFromStarkKey(
  starkPublicKey: string,
  accountHash: string,
  proxyHash: string,
): `0x${string}` {
  const pub = BigInt(starkPublicKey);
  const calldata = [
    BigInt(accountHash).toString(),
    hash.getSelectorFromName('initialize'),
    '2',
    pub.toString(),
    '0',
  ];
  const address = hash.calculateContractAddressFromHash(pub, BigInt(proxyHash), calldata, 0);
  return address as `0x${string}`;
}

/** Clé privée + adresse L2 dérivées d'une clé EVM, avec la configuration réseau Paradex. */
export interface DerivedL2Account {
  l2PrivateKey: `0x${string}`;
  l2Address: `0x${string}`;
  /** Clé publique Stark (felt) — `public_key` du body d'onboarding. */
  starkPublicKey: string;
  /** Adresse EVM parente (header `PARADEX-ETHEREUM-ACCOUNT`). */
  ethAddress: `0x${string}`;
}

/**
 * Dérive le compte L2 Paradex (flux Starknet v1) depuis une **clé privée EVM** en lisant la config
 * réseau (`l1_chain_id`, `paraclear_account_hash`, `paraclear_account_proxy_hash`) via
 * `GET /system/config`. **Async** car elle dépend de la config serveur (jamais hardcodée).
 */
export async function deriveL2Account(
  client: ParadexClient,
  network: Network,
  ethPrivateKey: `0x${string}`,
): Promise<DerivedL2Account> {
  const config = await getSystemConfig(client, network);
  const l1ChainId = Number(config.l1_chain_id);
  if (!Number.isFinite(l1ChainId)) {
    throw new Error(
      'deriveL2Account (Paradex) : `l1_chain_id` absent/invalide dans system/config.',
    );
  }
  const accountHash = config.paraclear_account_hash;
  const proxyHash = config.paraclear_account_proxy_hash;
  if (typeof accountHash !== 'string' || typeof proxyHash !== 'string') {
    throw new Error(
      'deriveL2Account (Paradex) : `paraclear_account_hash`/`paraclear_account_proxy_hash` manquant.',
    );
  }
  const l2PrivateKey = l2PrivateKeyFromEth(ethPrivateKey, l1ChainId);
  const starkPublicKey = ec.starkCurve.getStarkKey(l2PrivateKey);
  const l2Address = l2AddressFromStarkKey(starkPublicKey, accountHash, proxyHash);
  return {
    l2PrivateKey,
    l2Address,
    starkPublicKey,
    ethAddress: ethAddressFromPrivateKey(ethPrivateKey),
  };
}

/**
 * Construit un {@link Signer} Paradex (compte L2 Starknet) à partir d'une **clé privée EVM** — flux
 * d'onboarding officiel. Pratique pour `new Paradex({ desk: await signerFromEthKey(...) })`.
 */
export async function signerFromEthKey(
  client: ParadexClient,
  network: Network,
  ethPrivateKey: `0x${string}`,
): Promise<Signer> {
  const derived = await deriveL2Account(client, network, ethPrivateKey);
  return {
    l2PrivateKey: derived.l2PrivateKey,
    l2Address: derived.l2Address,
    network,
    ethAddress: derived.ethAddress,
  };
}
