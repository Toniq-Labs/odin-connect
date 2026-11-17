import { User } from "./user";

/** A member's standing in a community. `owner` is the community's creator. */
export type CommunityRole = "owner" | "admin" | "moderator" | "member";

/** Roles an owner/admin may assign. `owner` is never assignable. */
export type AssignableCommunityRole = Exclude<CommunityRole, "owner">;

export interface CommunityProfile {
  user: string;
  /** Storage filename, not a URL. Use `getBannerImageUrl()` to display it. */
  banner_image: string | null;
  is_public: boolean;
  created_at: Date;
}

export interface CommunityStats {
  volume_7d: bigint;
  volume_30d: bigint;
  volume_6m: bigint;
  volume_total: bigint;
  power_users_7d: number;
  power_users_30d: number;
  power_users_6m: number;
  power_users_total: number;
  users_7d: number;
  users_30d: number;
  users_6m: number;
  users_total: number;
  /** Only present for the community's owner/admins and platform admins. */
  fees_total?: bigint;
  fees_7d?: bigint;
  fees_30d?: bigint;
  fee_payouts?: number;
}

export interface Community {
  principal: string;
  username: string;
  image?: string;
  bio?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  website?: string;
  ref_code?: string | null;
  member_count: number;
  created_at: Date;
  profile: CommunityProfile;
  stats?: CommunityStats | null;
}

/** A list row: the community plus the caller's role (null when anonymous or not a member). */
export interface CommunityListItem extends Community {
  membership: CommunityRole | null;
}

export type ChatAccessDenialReason = "membership" | "threshold" | "banned";

export interface ChatChannelAccess {
  can_view: boolean;
  can_post: boolean;
  /** Null when `can_view` is true. Never `banned` (a ban is a mute). */
  can_view_reason: ChatAccessDenialReason | null;
  /** Null when `can_post` is true. */
  can_post_reason: ChatAccessDenialReason | null;
}

export interface ChatAccess {
  public: ChatChannelAccess;
  private: ChatChannelAccess;
}

/** The detail response: list row plus the caller's chat verdicts. */
export interface CommunityDetail extends CommunityListItem {
  chat_access: ChatAccess;
  /** Minimum recommended-token value (msats) to post in the public chat. Null when the API sends none. */
  public_chat_threshold: bigint | null;
  /** Minimum recommended-token value (msats) to view/post in the private chat. Null when the API sends none. */
  private_chat_threshold: bigint | null;
}

export type CommunityMemberUser = Pick<
  User,
  "principal" | "username" | "image"
> & {
  bio: string | null;
};

export interface CommunityMemberBan {
  id: bigint;
  context_type: "community";
  context_id: string;
  user: string;
  /** Null when no reason was given, or when the viewer may not see it. */
  reason: string | null;
  /** Null when the viewer may not see it. */
  banned_by: string | null;
  banned_at: Date;
  expires_at: Date | null;
  is_active: boolean;
}

export interface CommunityMember {
  community: string;
  user: string;
  role: CommunityRole;
  joined_at: Date;
  rel_user: CommunityMemberUser | null;
  /** Only set by `getMembers()`; omitted by join/add/update responses. */
  comment_ban?: CommunityMemberBan | null;
}

export interface CommunityRecommendedTokenSummary {
  id: string;
  name: string;
  ticker: string;
  vanity_ticker: string;
  image?: string | null;
  price: number;
  /** 24h price change as a percentage (5.5 = +5.5%). */
  priceChange24h: number;
  marketCap: number;
}

/** Note: this payload is camelCase on the API, unlike the rest of the module. */
export interface CommunityRecommendedToken {
  communityId: string;
  tokenId: string;
  token: CommunityRecommendedTokenSummary;
  description?: string | null;
  addedBy: { id: string; name: string };
  addedAt: Date;
}

export type CommunitySortableFields =
  | "member_count"
  | "volume_7d"
  | "volume_30d"
  | "volume_6m"
  | "volume_total"
  | "power_users_7d"
  | "power_users_30d"
  | "power_users_6m"
  | "power_users_total"
  | "users_7d"
  | "users_30d"
  | "users_6m"
  | "users_total"
  /** `fees_*` sorts are honoured only for platform admins; otherwise dropped. */
  | "fees_total"
  | "fees_7d"
  | "fees_30d";

export type CommunityFilterFields = {
  /** Matches username, bio or principal. Max 128 chars. */
  search: string;
  /** Only communities where the connected user holds one of these roles. Requires an API key. */
  role_in: ReadonlyArray<CommunityRole>;
};
