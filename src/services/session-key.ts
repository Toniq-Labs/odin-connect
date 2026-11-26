/**
 * The connect session key: the key Odin delegates to (`requires_delegation`)
 * and that signs `client_signature` for odin-api.
 *
 * Where the browser allows it, it is a non-extractable ECDSA P-256 key
 * (WebCrypto, `extractable: false`). Its `CryptoKeyPair` handle is kept in
 * IndexedDB, never serialized, so a script on the page can use the key while
 * the page is open but cannot copy it. Stored sessions and pending redirects
 * only hold a reference to it (`idb:<id>`).
 *
 * Elsewhere it falls back to the extractable Ed25519 key of 2.0/2.1, stored as
 * JSON:
 * - `env: "legacy"`: legacy.odin.fun and odin-api `/v1` accept no P-256 key yet;
 * - no WebCrypto or no working IndexedDB (some wallet in-app browsers);
 * - a connect started before the P-256 key was ready (it is generated in the
 *   background when `OdinConnect` is created, so this is only a connect in
 *   the first milliseconds after page load).
 */
import { ECDSAKeyIdentity, Ed25519KeyIdentity } from "@dfinity/identity";

export type SessionKey = Ed25519KeyIdentity | ECDSAKeyIdentity;

/** A session key and how to find it again (`SessionData.sessionKey`). */
export interface HeldSessionKey {
  identity: SessionKey;
  /** `idb:<id>` for a P-256 key, the key's JSON for Ed25519. */
  ref: string;
}

const IDB_PREFIX = "idb:";
const DB_NAME = "odin_connect";
const DB_VERSION = 1;
const STORE = "session_keys";

interface KeyRecord {
  keyPair: CryptoKeyPair;
  /** `Date.now()` when stored; old unreferenced records are swept. */
  createdAt: number;
}

/** The IndexedDB id of a P-256 key ref, or null for an Ed25519 ref. */
export function idbKeyId(ref: string): string | null {
  return ref.startsWith(IDB_PREFIX) ? ref.slice(IDB_PREFIX.length) : null;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB aborted"));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("IndexedDB is blocked"));
    });
    // a failed open is retried next time (e.g. a transient error)
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

/** Test helper: forget the open database. Not exported publicly. */
export function resetSessionKeyDb(): void {
  dbPromise?.then((db) => db.close(), () => {});
  dbPromise = null;
}

/** Whether WebCrypto and IndexedDB exist at all (not whether they work). */
function hasSecureStorage(): boolean {
  return (
    typeof indexedDB !== "undefined" &&
    typeof crypto !== "undefined" &&
    typeof crypto.subtle !== "undefined"
  );
}

/**
 * P-256 key handles in IndexedDB, for one `slug:env` (several apps on one
 * origin share the database). Every method rejects when IndexedDB fails.
 */
export class SessionKeyStore {
  private _prefix: string;

  constructor(slug: string, env: string) {
    this._prefix = `${slug}:${env}:`;
  }

  async put(id: string, keyPair: CryptoKeyPair): Promise<void> {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    const record: KeyRecord = { keyPair, createdAt: Date.now() };
    tx.objectStore(STORE).put(record, this._prefix + id);
    await transactionDone(tx);
  }

  async get(id: string): Promise<CryptoKeyPair | null> {
    const db = await openDb();
    const tx = db.transaction(STORE, "readonly");
    const record = (await requestResult(
      tx.objectStore(STORE).get(this._prefix + id)
    )) as KeyRecord | undefined;
    return record?.keyPair ?? null;
  }

  async delete(id: string): Promise<void> {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(this._prefix + id);
    await transactionDone(tx);
  }

  /**
   * Delete this app's records older than `maxAgeMs`, except `keep`: keys of
   * abandoned redirects and of sessions that ended in another tab. A pending
   * redirect in another tab is younger than `maxAgeMs`, so it is left alone.
   */
  async sweep(keep: ReadonlySet<string>, maxAgeMs: number): Promise<void> {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const keys = (await requestResult(store.getAllKeys())) as IDBValidKey[];
    const cutoff = Date.now() - maxAgeMs;
    for (const key of keys) {
      if (typeof key !== "string" || !key.startsWith(this._prefix)) continue;
      if (keep.has(key.slice(this._prefix.length))) continue;
      const record = (await requestResult(store.get(key))) as
        | KeyRecord
        | undefined;
      if (!record || record.createdAt < cutoff) {
        store.delete(key);
      }
    }
    await transactionDone(tx);
  }
}

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A new extractable Ed25519 key (the fallback), ref = its JSON. */
export function ed25519SessionKey(): HeldSessionKey {
  const identity = Ed25519KeyIdentity.generate();
  return { identity, ref: JSON.stringify(identity.toJSON()) };
}

/**
 * A P-256 key, generated now and not stored yet (`store.put` with its id when
 * a session or redirect needs it), or null when this browser can't keep one:
 * no WebCrypto, or IndexedDB that can't be opened.
 */
export async function generateP256SessionKey(): Promise<
  (HeldSessionKey & { id: string; keyPair: CryptoKeyPair }) | null
> {
  if (!hasSecureStorage()) return null;
  try {
    await openDb();
    const identity = await ECDSAKeyIdentity.generate({ extractable: false });
    const id = randomId();
    return { identity, ref: IDB_PREFIX + id, id, keyPair: identity.getKeyPair() };
  } catch {
    return null;
  }
}

/**
 * The key a ref points to: Ed25519 from its JSON (synchronous), P-256 from
 * IndexedDB. Null when a P-256 key is gone (site data cleared, or the
 * session ended in another tab) or the ref is unreadable.
 */
export async function loadSessionKey(
  ref: string,
  store: SessionKeyStore
): Promise<SessionKey | null> {
  const id = idbKeyId(ref);
  if (id === null) {
    try {
      return Ed25519KeyIdentity.fromJSON(ref);
    } catch {
      return null;
    }
  }
  if (!hasSecureStorage()) return null;
  try {
    const keyPair = await store.get(id);
    return keyPair ? await ECDSAKeyIdentity.fromKeyPair(keyPair) : null;
  } catch {
    return null;
  }
}
