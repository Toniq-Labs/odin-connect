import { useEffect, useState } from "react";
import type { OdinUser } from "odin-connect";

export function UserInfo({
  user,
  avatarUrl,
}: {
  user: OdinUser;
  avatarUrl: string;
}) {
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
            src={avatarUrl}
            className="avatar"
            alt="User Avatar"
            onError={() => setPlaceholder(true)}
          />
        )}
      </div>
      <strong>{user.username}</strong>
      <div className="user-details">
        {Object.entries(user).map(([key, value]) => (
          <div key={key}>
            <span>{key}:</span> <strong>{String(value)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
