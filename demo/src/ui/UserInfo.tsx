import { useEffect, useState } from "react";
import type { OdinUser } from "odin-connect";

export function UserInfo({ user }: { user: OdinUser }) {
  const [placeholder, setPlaceholder] = useState(false);

  useEffect(() => {
    setPlaceholder(false);
  }, [user]);

  return (
    <div className="user-card">
      <div>
        {placeholder ? (
          <div className="avatar">{user.username.slice(0, 2)}</div>
        ) : (
          <img
            src={`https://api.odin.fun/dev/user/${user.principal}/image`}
            className="avatar"
            alt="User Avatar"
            onError={() => setPlaceholder(true)}
          />
        )}
      </div>
      <strong>{user.username}</strong>
      <div className="user-details">
        <pre>{JSON.stringify(user, null, 2)}</pre>
      </div>
    </div>
  );
}
