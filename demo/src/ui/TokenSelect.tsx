import type { OdinToken } from "odin-connect";

export function TokenSelect({
  tokens,
  value,
  onChange,
  id,
}: {
  tokens: ReadonlyArray<OdinToken>;
  value: string;
  onChange: (value: string) => void;
  id?: string;
}) {
  return (
    <select
      id={id ?? "token"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {tokens.map((t) => (
        <option key={t.id} value={t.id}>
          {t.ticker} ({t.id})
        </option>
      ))}
    </select>
  );
}
