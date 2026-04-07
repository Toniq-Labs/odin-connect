export interface SessionData {
  principal: string;
  sessionKey: string;
  delegationChain: string | null;
  jwt: string | null;
}

export class SessionStorage {
  private _key: string;

  constructor(slug: string, env: string) {
    this._key = `odin_connect:${slug}:${env}:session`;
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
    try {
      localStorage.removeItem(this._key);
    } catch {
      // localStorage unavailable
    }
  }
}
