export interface WindowClientSettings {
  target: string;
  settings: string;
}

export class WindowClient {
  private _settings: WindowClientSettings;

  constructor(options?: Partial<WindowClientSettings>) {
    this._settings = {
      target: options?.target || "_blank",
      settings: options?.settings || "",
    };
  }

  get settings() {
    return this._settings;
  }

  set settings(settings: Partial<WindowClientSettings>) {
    this._settings = {
      ...this._settings,
      ...settings,
    };
  }

  open(url: URL) {
    return window.open(
      url,
      this._settings?.target || "_blank",
      this._settings?.settings
    );
  }
}
