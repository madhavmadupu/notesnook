# Encryption

Notesnook is an end-to-end encrypted note app. On every client, notes, content, settings, and attachments are encrypted **before** they leave the device. The only modules that are allowed to touch libsodium or any symmetric/asymmetric primitive are `packages/crypto` and `packages/sodium`. The rest of the codebase — including `@notesnook/core` — talks to an `IStorage` / `NNCrypto` facade.

> **Fork note.** `servers/convex/` in this fork currently receives **plaintext** sync payloads — E2EE is intentionally off while the sync backend is migrated. The *local* encryption layer on every client is still active, so databases at rest and attachments on disk remain encrypted. Do not point production users at this Convex deployment.

## Where it lives in the codebase

| Path | Purpose |
| ---- | ------- |
| `packages/crypto/src/index.ts` | `NNCrypto` facade — public crypto API |
| `packages/sodium/src/node.ts` | Node bindings (`sodium-native`) |
| `packages/sodium/src/browser.ts` | WASM wrapper (`libsodium-wrappers-sumo`) |
| `packages/core/src/interfaces.ts` | `IStorage` + `IFileStorage` interfaces |
| `packages/core/src/utils/crypto.ts` | Thin wrapper core uses to encode/decode `Cipher` objects |
| `packages/core/src/api/vault.ts` | Vault lock/unlock and re-encryption |
| `packages/core/src/api/key-manager.ts` | Key rotation |
| `apps/web/src/interfaces/` | Web-side `IStorage` implementation (IndexedDB + SubtleCrypto where possible) |
| `apps/desktop/src/api/safe-storage.ts` | OS-keyring wrapper for desktop |

## Primitives

Notesnook only uses libsodium primitives; there is no homemade crypto anywhere in the codebase.

| Purpose | Algorithm | libsodium name |
| ------- | --------- | -------------- |
| Symmetric AEAD (per-item) | XChaCha20-Poly1305 (IETF, 24-byte nonce) | `crypto_aead_xchacha20poly1305_ietf_encrypt` |
| Streaming AEAD (attachments) | XChaCha20-Poly1305 secretstream | `crypto_secretstream_xchacha20poly1305_*` |
| Key derivation from password | Argon2i (per-item) | `crypto_pwhash` (with `crypto_pwhash_ALG_ARGON2I13`) |
| Password hashing (server auth) | Argon2id13 | `crypto_pwhash_*_ALG_ARGON2ID13` |
| Generic hash | BLAKE2b | `crypto_generichash` |
| Public-key encryption (shares) | X25519 (Curve25519) + ChaCha20-Poly1305 via `crypto_box_seal` | `crypto_box_seal`, `crypto_box_seal_open` |

The default Argon2 parameters are tuned conservatively:

- Per-item keys: opslimit `3`, memlimit `8 MB` — fast enough for UI flows.
- User master key: opslimit `3`, memlimit `64 MB` — intentionally slow to brute-force.

## `NNCrypto` public API

`packages/crypto/src/index.ts` exports a single class:

```ts
class NNCrypto {
  async encrypt(key, data, outputFormat?): Promise<Cipher>;
  async encryptMulti(key, items, outputFormat?): Promise<Cipher[]>;

  async decrypt(key, cipher, outputFormat?): Promise<any>;
  async decryptMulti(key, ciphers, outputFormat?): Promise<any[]>;

  async decryptAsymmetric(keyPair, cipher): Promise<any>;

  async hash(password, salt): Promise<string>;
  async deriveKey(password, salt?): Promise<{ key: string; salt: string }>;
  async deriveKeyPair(password, salt?): Promise<{ privateKey; publicKey }>;

  async exportKey(password, salt): Promise<string>;
  async exportKeyPair(password, salt): Promise<KeyPair>;

  createEncryptionStream(key): Stream;
  createDecryptionStream(key): Stream;
}
```

All methods accept input in base64, hex, or raw Uint8Array and produce output in the caller's requested format. Internally they route to the Sodium provider via a lazy import so the platform-appropriate backend is used.

## `Cipher` shape

The serialised form that goes into SQLite and over the wire:

```ts
type Cipher = {
  format: "base64" | "hex" | "uint8array";
  cipher: string | Uint8Array;   // ciphertext
  iv:     string | Uint8Array;   // 24-byte nonce for XChaCha20-Poly1305
  salt:   string | Uint8Array;   // Argon2 salt (if item-key derived)
  length: number;                // plaintext length in bytes
  alg:    "xcha-argon2i13";      // algorithm identifier
};
```

The `alg` tag is versioned so future rotations (for example, moving to Argon2id) can coexist. `packages/core/src/api/key-manager.ts` handles rewrapping when the default tag changes.

## Sodium provider

`@notesnook/sodium` is isomorphic:

- **Node** (`src/node.ts`): thin C-FFI wrapper over [`sodium-native`](https://github.com/sodium-friends/sodium-native), required as a peer dependency. Used by Electron (main process), the desktop ESM/CJS dist, and any Node tooling.
- **Browser** (`src/browser.ts`): WASM wrapper over [`libsodium-wrappers-sumo`](https://github.com/jedisct1/libsodium.js). Normalises a couple of constant-naming quirks and awaits `sodium.ready` before first use.

The package's `exports` map in `packages/sodium/package.json` routes imports conditionally:

```jsonc
{
  "exports": {
    ".": {
      "node":    { "require": "./dist/node.js",    "import": "./dist/node.mjs" },
      "default": { "require": "./dist/browser.js", "import": "./dist/browser.mjs" }
    }
  }
}
```

Bundlers (Vite, Metro, Electron's esbuild) pick the right target automatically.

## `IStorage` / `IFileStorage` — the encryption boundary

`packages/core/src/interfaces.ts` defines:

```ts
interface IStorage {
  encrypt(key, plaintext): Promise<Cipher>;
  decrypt(key, cipher): Promise<string>;
  generateCryptoKey(password, salt?): Promise<string>;
  generateCryptoKeyPair(password, salt?): Promise<KeyPair>;

  read<T>(key): Promise<T | null>;
  write<T>(key, value: T): Promise<void>;
  remove(key): Promise<void>;
  clear(): Promise<void>;
}

interface IFileStorage {
  uploadFile(hash, options): Promise<boolean>;
  downloadFile(hash, options): Promise<ReadableStream<Uint8Array>>;
  deleteFile(hash): Promise<boolean>;
  readEncrypted(hash, key, cipherData): Promise<Uint8Array>;
  writeEncryptedBase64(data, key): Promise<{ hash, iv, salt, alg, size }>;
  hashBase64(data): Promise<string>;
}

interface ICompressor {
  compress(data: string): string;
  decompress(data: string): string;
}
```

Every client provides concrete implementations. The core package treats them as opaque.

- **Web** — IndexedDB for KV, Web Crypto + `@notesnook/crypto` for ops, `@notesnook/streamable-fs` for attachments.
- **Desktop** — JSON file + Electron `safeStorage` (OS keyring) for KV, local filesystem for attachments, same crypto package.
- **Mobile** — native `SharedPreferences` / Keychain for KV, native filesystem for attachments, same crypto package via `@notesnook/sodium`.

## Key hierarchy

```
password ──Argon2id──► user master key (never persisted raw)
                           │
                           ├── wrapped(master key) ──► stored in IStorage
                           │
                           ├── database cipher key (PRAGMA key on SQLite)
                           │
                           └── per-vault key ──wrapped with master──► vaults.keyData
                                       │
                                       └── re-encrypts vault-owned items
```

- The **master key** is derived on login; it lives in memory for the session and is wiped on logout.
- A **database cipher key** derives from the master key and is passed to the SQLite driver as `PRAGMA key`. This is what encrypts the file at rest.
- **Vault keys** are per-vault 256-bit keys, generated at vault creation and wrapped with the master key. Items belonging to the vault are re-encrypted with the vault key.
- **Attachment keys** are per-file random keys; each file stores its wrapped key so individual files can be shared without leaking the master key.

## Vault

`packages/core/src/api/vault.ts` implements lock/unlock:

1. On unlock, the user supplies the vault password. `NNCrypto` derives the vault key via Argon2 with the stored salt.
2. The key is held in memory for the session (configurable TTL: 15min / 30min / 1h / forever).
3. Items moved into the vault are re-encrypted: first decrypted with the master key (if previously elsewhere), then encrypted with the vault key, then the outer record is re-wrapped with the master key as usual. So vault content is doubly protected.
4. `changePassword()` walks every vault-owned item and re-wraps it. This is why password changes are heavy operations.

## Attachments

`packages/core/src/database/fs.ts` coordinates attachments:

1. On upload, the file is hashed (BLAKE2b) for deduplication.
2. A random key is generated; the file is streaming-encrypted in fixed chunks (default 512KB) via `crypto_secretstream_xchacha20poly1305_push`.
3. Ciphertext chunks are either written to `@notesnook/streamable-fs` (web) or the native filesystem (desktop/mobile), then uploaded.
4. The `attachments` row stores `hash`, `filename`, `mimeType`, `size`, `iv`, `salt`, `alg`, and the wrapped `key`. Only the wrapped key is synced.
5. On download, the client streams ciphertext → `crypto_secretstream_xchacha20poly1305_pull` → consumer, so very large files never fully load into memory.

## Monographs and public shares

Monographs (public notes) bypass E2EE by design: the user explicitly opts into publishing. The published blob is still hashed and signed, but the server holds a plaintext copy so the monograph URL can serve anyone. The user can revoke a monograph at any time and the server deletes it.

Shared-with-a-friend (not yet enabled on this fork) uses `crypto_box_seal` with the recipient's long-lived X25519 public key.

## Password changes and key rotation

- `Database.changePassword(newPassword)` in `packages/core/src/api/index.ts`:
  1. Derives the new master key from `newPassword`.
  2. Re-wraps all vault keys, KV entries, and encrypted settings with the new key.
  3. Issues a `PRAGMA rekey` on the SQLite database so the at-rest file is re-encrypted.
  4. Signals sync so other devices can be prompted to re-login.
- Key rotation for individual items (used when migrating `alg` versions) is orchestrated by `packages/core/src/api/key-manager.ts`.

## Threat model (summary)

| Threat | Mitigation |
| ------ | ---------- |
| Server compromise | All sync payloads encrypted client-side (upstream). Server never holds key material. |
| Database file theft | SQLite encrypted at rest via `PRAGMA key`; wrapped master key requires password to unwrap. |
| Phone loss | App-lock (biometric / PIN) + optional vault for sensitive notes. |
| Malicious browser extension | Web client avoids storing cleartext; editor content never reaches unrelated extensions unless user explicitly copies. |
| Snapshot leakage on mobile | `RCTNNativeModule.setSecureMode()` toggles `FLAG_SECURE` on Android. |
| Side-channel via attachments | Attachments keyed per-file; revocation deletes from server + local cache. |
| Password brute-force | Argon2id with high memlimit; no password hints stored. |
| Cipher downgrade | `alg` tag refuses older algorithms when a newer tag is configured. |

## Verifying claims

Notesnook publishes a verifier app (`apps/vericrypt/`) and the crypto library is open source. Anyone can audit:

- the Argon2 / XChaCha20 parameters in `packages/crypto/src/index.ts`,
- the `Cipher` wire format in `packages/core/src/types.ts`,
- how keys are derived and stored in `IStorage` implementations.

If you find an issue, file it with `crypto:` as the scope per `CONTRIBUTING.md`.
