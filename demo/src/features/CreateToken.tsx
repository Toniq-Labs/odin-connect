import { useState } from "react";
import { useOdinContext } from "../OdinContext";
import { OdinUtils } from "odin-connect";
import { useReturnState } from "../useReturnState";
const randomInt = Math.floor(Math.random() * 1000);

export function CreateToken() {
  const [image, setImage] = useState<File | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const { odinConnect, requestUser } = useOdinContext();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("Token " + randomInt);
  const [ticker, setTicker] = useState("TKN" + randomInt);
  const [vanityTicker, setVanityTicker] = useState("");
  const [description, setDescription] = useState("This is a test token");
  const [website, setWebsite] = useState("");
  const [telegram, setTelegram] = useState("");
  const [twitter, setTwitter] = useState("");
  const [preBuy, setPreBuy] = useState("");
  const [discount, setDiscount] = useState("");
  // returnState is plain JSON, so the image File is not carried: after a
  // connect-first redirect the text fields are restored but the image has to
  // be selected again.
  const redirect = useReturnState({
    action: "create_token",
    label: "create the token (select the image again first)",
    success: (f) => `Token ${f.name} (${f.ticker}) created successfully!`,
    restore: (f) => {
      setName(f.name);
      setTicker(f.ticker);
      setVanityTicker(f.vanityTicker);
      setDescription(f.description);
      setWebsite(f.website);
      setTelegram(f.telegram);
      setTwitter(f.twitter);
      setPreBuy(f.preBuy);
      setDiscount(f.discount);
    },
    setResult,
  });

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
        <label>Vanity Ticker (optional):</label>
        <input
          type="text"
          value={vanityTicker}
          onChange={(e) => setVanityTicker(e.target.value)}
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
          const resume = redirect.state({
            name,
            ticker,
            vanityTicker,
            description,
            website,
            telegram,
            twitter,
            preBuy,
            discount,
          });
          try {
            setResult(null);
            setLoading(true);
            if (!odinConnect) {
              throw new Error("OdinConnect is not initialized");
            }

            const user = await requestUser(resume);

            if (!image) {
              throw new Error("No image selected");
            }

            const buyAmount = OdinUtils.convertToOdinAmount(preBuy || "0");

            await user.createToken({
              image,
              name,
              ticker,
              vanity_ticker: vanityTicker,
              description,
              website,
              telegram,
              twitter,
              buy: buyAmount,
              discount,
              returnState: resume,
            });
            setResult(`Token created successfully!`);
            setLoading(false);
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
