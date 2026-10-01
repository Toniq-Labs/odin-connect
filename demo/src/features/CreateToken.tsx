import { useState } from "react";
import { useOdinContext } from "../OdinContext";
import { OdinUtils } from "odin-connect";
import { useRedirectAction } from "../useRedirectAction";
const randomInt = Math.floor(Math.random() * 1000);

export function CreateToken() {
  const [image, setImage] = useState<File | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const { odinConnect, requestUser } = useOdinContext();
  const [loading, setLoading] = useState(false);
  // The image File cannot ride in the URL: after a connect-first redirect the
  // text fields are restored but the image has to be selected again.
  const redirect = useRedirectAction({
    action: "create_token",
    label: "create the token (select the image again first)",
    success: (f) => `Token ${f.name} (${f.ticker}) created successfully!`,
    setResult,
  });
  const f = redirect.fields;
  const [name, setName] = useState(f?.name ?? "Token " + randomInt);
  const [ticker, setTicker] = useState(f?.ticker ?? "TKN" + randomInt);
  const [vanityTicker, setVanityTicker] = useState(f?.vanityTicker ?? "");
  const [description, setDescription] = useState(
    f?.description ?? "This is a test token"
  );
  const [website, setWebsite] = useState(f?.website ?? "");
  const [telegram, setTelegram] = useState(f?.telegram ?? "");
  const [twitter, setTwitter] = useState(f?.twitter ?? "");
  const [preBuy, setPreBuy] = useState(f?.preBuy ?? "");
  const [discount, setDiscount] = useState(f?.discount ?? "");

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
          setResult(null);
          setLoading(true);
          redirect.begin({
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
            if (!odinConnect) {
              throw new Error("OdinConnect is not initialized");
            }

            const user = await requestUser();

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
          } finally {
            redirect.end();
          }
        }}
      >
        {loading ? "Creating..." : "Create Token"}
      </button>

      {result && <div className="result">{result}</div>}
    </div>
  );
}
