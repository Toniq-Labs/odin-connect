import { useState } from "react";
import { useOdinContext } from "../OdinContext";
import { OdinUtils } from "odin-connect";
const randomInt = Math.floor(Math.random() * 1000);

export function CreateToken() {
  const [image, setImage] = useState<File | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const { odinConnect, user } = useOdinContext();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("Token " + randomInt);
  const [ticker, setTicker] = useState("TKN" + randomInt);
  const [description, setDescription] = useState("This is a test token");
  const [website, setWebsite] = useState("");
  const [telegram, setTelegram] = useState("");
  const [twitter, setTwitter] = useState("");
  const [preBuy, setPreBuy] = useState("");
  const [discount, setDiscount] = useState("");

  return (
    <div className="trade-form">
      <div className="form-group">
        <label>Image</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              setImage(e.target.files[0]);
            }
          }}
        />
      </div>
      <div className="form-group">
        <label>Token Name:</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>Token Ticker:</label>
        <input
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>Description:</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>Website:</label>
        <input
          type="text"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>Telegram:</label>
        <input
          type="text"
          value={telegram}
          onChange={(e) => setTelegram(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>Twitter:</label>
        <input
          type="text"
          value={twitter}
          onChange={(e) => setTwitter(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>Pre-buy (BTC):</label>
        <input
          type="text"
          value={preBuy}
          onChange={(e) => setPreBuy(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>Discount Code:</label>
        <input
          type="text"
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
        />
      </div>
      <button
        disabled={loading}
        onClick={async () => {
          try {
            setResult(null);
            setLoading(true);
            if (!odinConnect) {
              throw new Error("OdinConnect is not initialized");
            }

            if (!user) {
              throw new Error("User is not connected");
            }

            if (!image) {
              throw new Error("No image selected");
            }

            const buyAmount = OdinUtils.convertToOdinAmount(preBuy || "0");

            const url = await odinConnect.createToken({
              image,
              principal: user.principal,
              name,
              ticker,
              description,
              website,
              telegram,
              twitter,
              buy: buyAmount,
              discount,
            });
            setResult(`Image uploaded successfully: ${url}`);
          } catch (error) {
            setLoading(false);
            if (error instanceof Error) {
              setResult(`Error: ${error.message}`);
            } else {
              setResult("Error");
            }
          }
        }}
      >
        {loading ? "Creating..." : "Create Token"}
      </button>

      {result && <div className="result">{result}</div>}
    </div>
  );
}
