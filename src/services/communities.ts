import {
  AssignableCommunityRole,
  Community,
  CommunityDetail,
  CommunityFilterFields,
  CommunityListItem,
  CommunityMember,
  CommunityRecommendedToken,
  CommunityRole,
  CommunitySortableFields,
} from "../models/community";
import { toApiError } from "./api-error";
import type { PaginatedResponse, Pagination, Sort } from "./api";
import { HttpClient } from "./http";

/**
 * Adapter for odin-api's Communities module (`GET /communities`,
 * `/community/:principal/...`). Mounted at `OdinApiClient.communities`.
 *
 * Reads are public but send the API key as a Bearer token when one is set, so
 * caller-relative fields (`membership`, `chat_access`, `stats.fees_*`) and the
 * `role_in` filter work for a connected user. Mutations require the key, which
 * `connect({ requires_api: true })` provides.
 *
 * Token amounts (`stats.volume_*`, `stats.fees_*`, chat thresholds) are
 * re-cast to `bigint`; the API serialises them as JSON numbers / strings.
 */
export class OdinCommunitiesClient {
  private _http: HttpClient;
  private _baseUrl: string;
  private _apiKey: () => string | null;

  constructor(http: HttpClient, baseUrl: string, apiKey: () => string | null) {
    this._http = http;
    this._baseUrl = baseUrl;
    this._apiKey = apiKey;
  }

  // ---- reads --------------------------------------------------------------

  /** Public communities. `filters.role_in` requires an API key (the API returns 400 otherwise). */
  async getCommunities(
    pagination: Pagination,
    sort?: Sort<CommunitySortableFields>,
    filters: Partial<CommunityFilterFields> = {},
  ): Promise<PaginatedResponse<CommunityListItem>> {
    const params: Record<string, string | number> = { ...pagination };
    if (sort) params.sort = `${sort.field}:${sort.direction}`;
    if (filters.search !== undefined) params.search = filters.search;
    if (filters.role_in !== undefined)
      params.role_in = filters.role_in.join(",");
    const response = await this._http.get<PaginatedResponse<CommunityListItem>>(
      `${this._baseUrl}/communities`,
      { params, ...this.authOptions(false) },
    );
    return { ...response, data: response.data.map(castCommunity) };
  }

  /** One community with the caller's membership and chat access. 403 when private and not a member. */
  async getCommunity(principal: string): Promise<CommunityDetail> {
    const detail = await this._http.get<CommunityDetail>(
      `${this._baseUrl}/community/${principal}`,
      this.authOptions(false),
    );
    return castDetail(detail);
  }

  /** Members, newest first. Private communities: members only. */
  async getMembers(
    principal: string,
    pagination: Pagination,
    role?: CommunityRole,
  ): Promise<PaginatedResponse<CommunityMember>> {
    const params: Record<string, string | number> = { ...pagination };
    if (role !== undefined) params.role = role;
    const response = await this._http.get<PaginatedResponse<CommunityMember>>(
      `${this._baseUrl}/community/${principal}/members`,
      { params, ...this.authOptions(false) },
    );
    return { ...response, data: response.data.map(castMember) };
  }

  /** Tokens recommended by the community, newest first. */
  getRecommendedTokens(principal: string, pagination: Pagination) {
    return this._http.get<PaginatedResponse<CommunityRecommendedToken>>(
      `${this._baseUrl}/community/${principal}/tokens`,
      { params: { ...pagination }, ...this.authOptions(false) },
    );
  }

  /** URL of the community's banner image (served by odin-api). */
  getBannerImageUrl(principal: string): string {
    return `${this._baseUrl}/community/${principal}/image`;
  }

  // ---- mutations (API key required) ---------------------------------------

  /** Join a public community as the connected user. */
  join(principal: string): Promise<CommunityMember> {
    return this.mutate(
      async () =>
        castMember(
          await this._http.post<CommunityMember, undefined>(
            `${this._baseUrl}/community/${principal}/join`,
            undefined,
            this.authOptions(true),
          ),
        ),
      "Failed to join community",
    );
  }

  /** Leave a community. The owner cannot leave. */
  leave(principal: string): Promise<void> {
    return this.mutate(async () => {
      await this._http.delete<void>(
        `${this._baseUrl}/community/${principal}/leave`,
        this.authOptions(true),
      );
    }, "Failed to leave community");
  }

  /** Add a user with a role below the caller's own (owner/admin only). */
  addMember(
    principal: string,
    userId: string,
    role: AssignableCommunityRole,
  ): Promise<CommunityMember> {
    return this.mutate(
      async () =>
        castMember(
          await this._http.post<
            CommunityMember,
            { role: AssignableCommunityRole }
          >(
            `${this._baseUrl}/community/${principal}/members/${userId}`,
            { role },
            this.authOptions(true),
          ),
        ),
      "Failed to add community member",
    );
  }

  /** Change a member's role (owner/admin only; cannot target yourself). */
  updateMemberRole(
    principal: string,
    userId: string,
    role: AssignableCommunityRole,
  ): Promise<CommunityMember> {
    return this.mutate(
      async () =>
        castMember(
          await this._http.patch<
            CommunityMember,
            { role: AssignableCommunityRole }
          >(
            `${this._baseUrl}/community/${principal}/members/${userId}`,
            { role },
            this.authOptions(true),
          ),
        ),
      "Failed to update community member role",
    );
  }

  /** Remove a member (admin or higher). `reason` max 500 chars. */
  kickMember(
    principal: string,
    userId: string,
    reason?: string,
  ): Promise<void> {
    return this.mutate(async () => {
      await this._http.post<void, { reason?: string }>(
        `${this._baseUrl}/community/${principal}/members/${userId}/kick`,
        reason === undefined ? {} : { reason },
        this.authOptions(true),
      );
    }, "Failed to kick community member");
  }

  /** Recommend a token (owner/moderator). `description` max 512 chars. */
  addRecommendedToken(
    principal: string,
    token: string,
    description?: string,
  ): Promise<CommunityRecommendedToken> {
    return this.mutate(
      () =>
        this._http.post<
          CommunityRecommendedToken,
          { token: string; description?: string }
        >(
          `${this._baseUrl}/community/${principal}/tokens`,
          description === undefined ? { token } : { token, description },
          this.authOptions(true),
        ),
      "Failed to add recommended token",
    );
  }

  /** Remove a recommended token (owner/moderator). */
  removeRecommendedToken(principal: string, tokenId: string): Promise<void> {
    return this.mutate(async () => {
      await this._http.delete<void>(
        `${this._baseUrl}/community/${principal}/tokens/${tokenId}`,
        this.authOptions(true),
      );
    }, "Failed to remove recommended token");
  }

  // ---- internals ----------------------------------------------------------

  /**
   * Axios options carrying the Bearer header when an API key is set. With
   * `required`, a missing key throws before any request is made.
   */
  private authOptions(required: boolean): {
    headers?: { Authorization: string };
  } {
    const key = this._apiKey();
    if (!key) {
      if (required) throw new Error("API key is not set");
      return {};
    }
    return { headers: { Authorization: `Bearer ${key}` } };
  }

  private async mutate<T>(fn: () => Promise<T>, fallback: string): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw toApiError(error, fallback);
    }
  }
}

const BIGINT_STAT_KEYS = [
  "volume_7d",
  "volume_30d",
  "volume_6m",
  "volume_total",
  "fees_total",
  "fees_7d",
  "fees_30d",
] as const;

function castCommunity<T extends Community>(community: T): T {
  if (!community.stats) return community;
  const stats = { ...community.stats };
  for (const key of BIGINT_STAT_KEYS) {
    const value = stats[key];
    if (value !== undefined && value !== null) {
      stats[key] = BigInt(value);
    }
  }
  return { ...community, stats };
}

function castDetail(detail: CommunityDetail): CommunityDetail {
  return {
    ...castCommunity(detail),
    public_chat_threshold: BigInt(detail.public_chat_threshold),
    private_chat_threshold: BigInt(detail.private_chat_threshold),
  };
}

function castMember(member: CommunityMember): CommunityMember {
  if (!member.comment_ban) return member;
  return {
    ...member,
    comment_ban: { ...member.comment_ban, id: BigInt(member.comment_ban.id) },
  };
}
