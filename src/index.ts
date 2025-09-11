const ORIGIN = "http://localhost:5173";

export class OdinConnect {
  constructor() {}

  connect(target = "_blank", settings: string): Promise<string> {
    return new Promise<string>((resolve) => {
      const handleMessage = (event: MessageEvent) => {
        if (event.origin === ORIGIN) {
          window.removeEventListener("message", handleMessage);
          resolve(event.data);
        }
      };
      window.open(ORIGIN, target, settings);
      window.addEventListener("message", handleMessage, { once: true });
    });
  }
}

export function hello() {
  console.log("Hello from Odin Connect!");
}
