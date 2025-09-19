import { useEffect, useState } from "react";
import type { OdinUser } from "odin-connect";

export function UserInfo({ user }: { user: OdinUser }) {
  const [placeholder, setPlaceholder] = useState(false);

  useEffect(() => {
    setPlaceholder(false);
  }, [user]);

  return (
    <div className="user-card">
      <div style={{ display: "flex", alignItems: "center", gap: "2pt" }}>
        {placeholder ? (
          <div className="avatar-placeholder">{user.username.slice(0, 2)}</div>
        ) : (
          <img
            src={`https://images.odin.fun/dev/user/${user.principal}`}
            alt="User Avatar"
            onError={() => setPlaceholder(true)}
          />
        )}
        <strong>{user.username}</strong>
      </div>
      <p>{user.principal}</p>
    </div>
  );
}
