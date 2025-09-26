import { useState } from "react";
import { useOdinContext } from "../OdinContext";

export function UploadImage() {
  const [image, setImage] = useState<File | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const { odinConnect, user } = useOdinContext();
  return (
    <div>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            setImage(e.target.files[0]);
          }
        }}
      />
      {image && (
        <div>
          <h3>Selected Image:</h3>
          <p>Name: {image.name}</p>
        </div>
      )}
      {image && (
        <button
          onClick={async () => {
            try {
              if (!odinConnect) {
                throw new Error("OdinConnect is not initialized");
              }

              if (!user) {
                throw new Error("User is not connected");
              }

              const url = await odinConnect.createToken({
                image,
                principal: user.principal,
                name: "Test Token",
                ticker: "TST",
                description: "This is a test token",
                website: "https://example.com",
                telegram: "https://t.me/example",
                twitter: "https://twitter.com/example",
              });
              setResult(`Image uploaded successfully: ${url}`);
            } catch (error) {
              if (error instanceof Error) {
                setResult(`Error uploading image: ${error.message}`);
              } else {
                setResult("Error uploading image");
              }
            }
          }}
        >
          Upload Image
        </button>
      )}
      {result && <div className="result">{result}</div>}
    </div>
  );
}
