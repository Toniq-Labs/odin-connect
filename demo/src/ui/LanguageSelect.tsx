import type { OdinLang } from "odin-connect";
import { useOdinContext } from "../OdinContext";

export const LanguageSelect = () => {
  const { lang, setLang } = useOdinContext();

  return (
    <div>
      <label htmlFor="popupLang">Popup language</label>{" "}
      <select
        id="popupLang"
        value={lang}
        onChange={(e) => setLang(e.target.value as OdinLang)}
      >
        <option value="en">English (en)</option>
        <option value="zh">中文 (zh)</option>
      </select>
    </div>
  );
};
