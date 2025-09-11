export class OdinConnect {
  private _bc: BroadcastChannel;

  constructor() {
    this._bc = new BroadcastChannel("odin-connect");
  }

  connect() {
    console.log("Connecting to Odin...");
  }

  sendMessage() {
    this._bc.postMessage({
      text: "Hello from the sending tab!",
      timestamp: Date.now(),
    });
    console.log("Message sent!");
  }

  receiveMessage() {
    this._bc.onmessage = (event) => {
      console.log("Message received:", event.data);
    };
  }
}
