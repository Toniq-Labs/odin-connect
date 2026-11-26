export interface SessionData {
  principal: string;
  /**
   * The session key, only for a session with a delegation (`""` otherwise):
   * `idb:<id>` for a non-extractable P-256 key kept in IndexedDB, or the
   * Ed25519 key's JSON (the fallback, and sessions stored before 2.2).
   */
  sessionKey: string;
  delegationChain: string | null;
  jwt: string | null;
}

export class SessionStorage {
  private _key: string;
  private _checkedKey: string;

  /** Called with the cleared session's `sessionKey` (to delete a P-256 key). */
  onSessionKeyRemoved: ((ref: string) => void) | null = null;

  constructor(slug: string, env: string) {
    this._key = `odin_connect:${slug}:${env}:session`;
    this._checkedKey = `odin_connect:${slug}:${env}:session_checked_at`;
  }

  /**
   * When odin-api last confirmed the stored session (ms since epoch), or 0.
   * In localStorage, so every tab of the app shares it.
   */
  lastCheckedAt(): number {
    try {
      const value = Number(localStorage.getItem(this._checkedKey));
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch {
      return 0;
    }
  }

  markChecked(at: number = Date.now()): void {
    try {
      localStorage.setItem(this._checkedKey, String(at));
    } catch {
      // localStorage unavailable (SSR, privacy mode)
    }
  }

  save(data: SessionData): void {
    try {
      localStorage.setItem(this._key, JSON.stringify(data));
    } catch {
      // localStorage unavailable (SSR, privacy mode)
    }
  }

  load(): SessionData | null {
    try {
      const raw = localStorage.getItem(this._key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!this.isValidSessionData(parsed)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private isValidSessionData(data: unknown): data is SessionData {
    if (typeof data !== "object" || data === null) return false;
    const obj = data as Record<string, unknown>;
    return (
      typeof obj.principal === "string" &&
      typeof obj.sessionKey === "string" &&
      (obj.delegationChain === null ||
        typeof obj.delegationChain === "string") &&
      (obj.jwt === null || typeof obj.jwt === "string")
    );
  }

  clear(): void {
    const ref = this.load()?.sessionKey;
    if (ref) {
      try {
        this.onSessionKeyRemoved?.(ref);
      } catch {
        // the key is swept later
      }
    }
    try {
      localStorage.removeItem(this._key);
      localStorage.removeItem(this._checkedKey);
    } catch {
      // localStorage unavailable
    }
  }
}
