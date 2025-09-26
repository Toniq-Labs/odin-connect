import { useState } from "react";
import { useOdinContext } from "../OdinContext";

export function UploadImage() {
  const [image, setImage] = useState<File | null>(null);

  const { odinConnect } = useOdinContext();
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
            if (!odinConnect) {
              throw new Error("OdinConnect is not initialized");
            }
            try {
              const url = await odinConnect.uploadImage(image);
              alert(`Image uploaded successfully: ${url}`);
            } catch (error) {
              console.error("Error uploading image:", error);
              alert("Error uploading image");
            }
          }}
        >
          Upload Image
        </button>
      )}
    </div>
  );
}
