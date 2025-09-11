const ORIGIN = "http://localhost:5173";

export type OdinUser = {
  username: string;
  principal: string;
  image: string;
};

export class OdinConnect {
  constructor() {}

  connect(target = "_blank", settings: string): Promise<OdinUser> {
    return new Promise<OdinUser>((resolve) => {
      const handleMessage = (event: MessageEvent) => {
        if (event.origin === ORIGIN) {
          const  user = JSON.parse(event.data) as OdinUser;
          resolve(user);
        }
      };
      window.open(`${ORIGIN}/authorize`, target, settings);
      window.addEventListener("message", handleMessage, { once: true });
    });
  }
}

export function hello() {
  console.log("Hello from Odin Connect!");
}
