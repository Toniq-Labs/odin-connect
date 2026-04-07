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
      return JSON.parse(raw) as SessionData;
    } catch {
      return null;
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(this._key);
    } catch {
      // localStorage unavailable
    }
  }
}
