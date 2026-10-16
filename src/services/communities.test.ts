import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError, AxiosResponse } from "axios";
import { OdinApiClient } from "./api";

const BASE = "https://api.odin.fun/dev";
const P = "aaaaa-aa";

function community(extra: Record<string, unknown> = {}) {
  return {
    principal: P,
    username: "odin-fans",
    member_count: 3,
    created_at: "2026-09-01T00:00:00.000Z",
    profile: { user: P, banner_image: null, is_public: true, created_at: "x" },
    stats: {
      volume_7d: 100,
      volume_30d: 200,
      volume_6m: 300,
      volume_total: 400,
      power_users_7d: 1,
      power_users_30d: 1,
      power_users_6m: 1,
      power_users_total: 1,
      users_7d: 3,
      users_30d: 3,
      users_6m: 3,
      users_total: 3,
    },
    membership: null,
    ...extra,
  };
}

describe("OdinCommunitiesClient", () => {
  let api: OdinApiClient;
  let http: OdinApiClient["_httpClient"];

  beforeEach(() => {
    api = new OdinApiClient("dev");
    http = api["_httpClient"];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is mounted on OdinApiClient", () => {
    expect(api.communities).toBeDefined();
  });

  describe("getCommunities", () => {
    it("sends pagination only when no sort/filters are given", async () => {
      const get = vi.spyOn(http, "get").mockResolvedValue({
        data: [],
        count: 0,
        page: 1,
        limit: 10,
      });
      await api.communities.getCommunities({ page: 1, limit: 10 });
      expect(get).toHaveBeenCalledWith(`${BASE}/communities`, {
        params: { page: 1, limit: 10 },
      });
    });

    it("sends sort as field:direction and joins role_in", async () => {
      api.apiKey = "jwt";
      const get = vi.spyOn(http, "get").mockResolvedValue({
        data: [],
        count: 0,
        page: 1,
        limit: 10,
      });
      await api.communities.getCommunities(
        { page: 2, limit: 5 },
        { field: "member_count", direction: "desc" },
        { search: "odin", role_in: ["owner", "admin"] },
      );
      expect(get).toHaveBeenCalledWith(`${BASE}/communities`, {
        params: {
          page: 2,
          limit: 5,
          sort: "member_count:desc",
          search: "odin",
          role_in: "owner,admin",
        },
        headers: { Authorization: "Bearer jwt" },
      });
    });

    it("casts bigint stats and leaves others untouched", async () => {
      vi.spyOn(http, "get").mockResolvedValue({
        data: [community({ stats: { ...community().stats, fees_total: 7 } })],
        count: 1,
        page: 1,
        limit: 10,
      });
      const { data } = await api.communities.getCommunities({
        page: 1,
        limit: 10,
      });
      expect(data[0].stats?.volume_total).toBe(400n);
      expect(data[0].stats?.fees_total).toBe(7n);
      expect(data[0].stats?.fees_7d).toBeUndefined();
      expect(data[0].stats?.users_total).toBe(3);
      expect(data[0].member_count).toBe(3);
    });

    it("passes a null stats through", async () => {
      vi.spyOn(http, "get").mockResolvedValue({
        data: [community({ stats: null })],
        count: 1,
        page: 1,
        limit: 10,
      });
      const { data } = await api.communities.getCommunities({
        page: 1,
        limit: 10,
      });
      expect(data[0].stats).toBeNull();
    });
  });

  describe("getCommunity", () => {
    it("fetches without auth header and casts thresholds", async () => {
      const get = vi.spyOn(http, "get").mockResolvedValue(
        community({
          chat_access: {
            public: {
              can_view: true,
              can_post: false,
              can_view_reason: null,
              can_post_reason: "membership",
            },
            private: {
              can_view: false,
              can_post: false,
              can_view_reason: "membership",
              can_post_reason: "membership",
            },
          },
          public_chat_threshold: "1000000",
          private_chat_threshold: "99999999999999999999",
        }),
      );
      const detail = await api.communities.getCommunity(P);
      expect(get).toHaveBeenCalledWith(`${BASE}/community/${P}`, {});
      expect(detail.public_chat_threshold).toBe(1_000_000n);
      expect(detail.private_chat_threshold).toBe(99999999999999999999n);
      expect(detail.stats?.volume_7d).toBe(100n);
      expect(detail.chat_access.private.can_view_reason).toBe("membership");
    });

    it("returns null thresholds instead of throwing when the API omits them", async () => {
      vi.spyOn(http, "get").mockResolvedValue(
        community({
          chat_access: {},
          public_chat_threshold: null,
          private_chat_threshold: undefined,
        }),
      );
      const detail = await api.communities.getCommunity(P);
      expect(detail.public_chat_threshold).toBeNull();
      expect(detail.private_chat_threshold).toBeNull();
    });

    it("accepts numeric thresholds too", async () => {
      vi.spyOn(http, "get").mockResolvedValue(
        community({
          chat_access: {},
          public_chat_threshold: 5,
          private_chat_threshold: 7n,
        }),
      );
      const detail = await api.communities.getCommunity(P);
      expect(detail.public_chat_threshold).toBe(5n);
      expect(detail.private_chat_threshold).toBe(7n);
    });

    it("sends the Bearer header once an API key is set", async () => {
      api.apiKey = "jwt";
      const get = vi.spyOn(http, "get").mockResolvedValue(
        community({
          chat_access: {},
          public_chat_threshold: "0",
          private_chat_threshold: "0",
        }),
      );
      await api.communities.getCommunity(P);
      expect(get).toHaveBeenCalledWith(`${BASE}/community/${P}`, {
        headers: { Authorization: "Bearer jwt" },
      });
    });
  });

  describe("read errors", () => {
    it("getCommunity surfaces the API's 403 message for a private community", async () => {
      const err = new AxiosError("Request failed with status code 403");
      err.response = {
        status: 403,
        data: { message: "This community is private" },
      } as AxiosResponse;
      vi.spyOn(http, "get").mockRejectedValue(err);
      await expect(api.communities.getCommunity(P)).rejects.toThrow(
        "This community is private",
      );
    });

    it("getMembers / getCommunities / getRecommendedTokens normalise too", async () => {
      const err = new AxiosError("Request failed with status code 400");
      err.response = {
        status: 400,
        data: { message: ["role_in requires authentication"] },
      } as AxiosResponse;
      vi.spyOn(http, "get").mockRejectedValue(err);
      await expect(
        api.communities.getMembers(P, { page: 1, limit: 1 }),
      ).rejects.toThrow("role_in requires authentication");
      await expect(
        api.communities.getCommunities({ page: 1, limit: 1 }),
      ).rejects.toThrow("role_in requires authentication");
      await expect(
        api.communities.getRecommendedTokens(P, { page: 1, limit: 1 }),
      ).rejects.toThrow("role_in requires authentication");
    });

    it("rejects with a plain Error, not an AxiosError", async () => {
      vi.spyOn(http, "get").mockRejectedValue(new AxiosError("boom"));
      const rejection = await api.communities.getCommunity(P).catch((e) => e);
      expect(rejection).toBeInstanceOf(Error);
      expect(rejection.name).toBe("Error");
      expect(rejection.message).toBe("boom");
    });
  });

  describe("getMembers", () => {
    it("sends role filter and casts comment_ban.id", async () => {
      const get = vi.spyOn(http, "get").mockResolvedValue({
        data: [
          {
            community: P,
            user: "u1",
            role: "member",
            joined_at: "x",
            rel_user: { principal: "u1", username: "a", image: "", bio: null },
            comment_ban: { id: 12, reason: null, banned_by: null },
          },
          {
            community: P,
            user: "u2",
            role: "admin",
            joined_at: "x",
            rel_user: null,
            comment_ban: null,
          },
        ],
        count: 2,
        page: 1,
        limit: 20,
      });
      const { data } = await api.communities.getMembers(
        P,
        { page: 1, limit: 20 },
        "member",
      );
      expect(get).toHaveBeenCalledWith(`${BASE}/community/${P}/members`, {
        params: { page: 1, limit: 20, role: "member" },
      });
      expect(data[0].comment_ban?.id).toBe(12n);
      expect(data[1].comment_ban).toBeNull();
    });
  });

  it("getRecommendedTokens hits /tokens with pagination", async () => {
    const get = vi.spyOn(http, "get").mockResolvedValue({
      data: [],
      count: 0,
      page: 1,
      limit: 20,
    });
    await api.communities.getRecommendedTokens(P, { page: 1, limit: 20 });
    expect(get).toHaveBeenCalledWith(`${BASE}/community/${P}/tokens`, {
      params: { page: 1, limit: 20 },
    });
  });

  it("builds the banner image URL per environment", () => {
    expect(api.communities.getBannerImageUrl(P)).toBe(
      `${BASE}/community/${P}/image`,
    );
    expect(new OdinApiClient("prod").communities.getBannerImageUrl(P)).toBe(
      `https://api.odin.fun/v2/community/${P}/image`,
    );
  });

  describe("mutations", () => {
    it("reject without an API key and make no request", async () => {
      const post = vi.spyOn(http, "post");
      await expect(api.communities.join(P)).rejects.toThrow(
        "API key is not set",
      );
      await expect(api.communities.leave(P)).rejects.toThrow(
        "API key is not set",
      );
      expect(post).not.toHaveBeenCalled();
    });

    it("join posts with the Bearer header and casts the member", async () => {
      api.apiKey = "jwt";
      const post = vi.spyOn(http, "post").mockResolvedValue({
        community: P,
        user: "me",
        role: "member",
        joined_at: "x",
        rel_user: null,
      });
      const member = await api.communities.join(P);
      expect(post).toHaveBeenCalledWith(
        `${BASE}/community/${P}/join`,
        undefined,
        { headers: { Authorization: "Bearer jwt" } },
      );
      expect(member.role).toBe("member");
    });

    it("leave / kick / removeRecommendedToken resolve undefined on 204", async () => {
      api.apiKey = "jwt";
      const del = vi.spyOn(http, "delete").mockResolvedValue("");
      const post = vi.spyOn(http, "post").mockResolvedValue("");
      await expect(api.communities.leave(P)).resolves.toBeUndefined();
      await expect(
        api.communities.kickMember(P, "u1", "spam"),
      ).resolves.toBeUndefined();
      await expect(
        api.communities.removeRecommendedToken(P, "2jjj"),
      ).resolves.toBeUndefined();
      expect(del).toHaveBeenNthCalledWith(1, `${BASE}/community/${P}/leave`, {
        headers: { Authorization: "Bearer jwt" },
      });
      expect(post).toHaveBeenCalledWith(
        `${BASE}/community/${P}/members/u1/kick`,
        { reason: "spam" },
        { headers: { Authorization: "Bearer jwt" } },
      );
      expect(del).toHaveBeenNthCalledWith(
        2,
        `${BASE}/community/${P}/tokens/2jjj`,
        { headers: { Authorization: "Bearer jwt" } },
      );
    });

    it("kick omits reason when not given", async () => {
      api.apiKey = "jwt";
      const post = vi.spyOn(http, "post").mockResolvedValue("");
      await api.communities.kickMember(P, "u1");
      expect(post.mock.calls[0][1]).toEqual({});
    });

    it("addMember / updateMemberRole send the role body", async () => {
      api.apiKey = "jwt";
      const row = {
        community: P,
        user: "u1",
        role: "moderator",
        joined_at: "x",
        rel_user: null,
      };
      const post = vi.spyOn(http, "post").mockResolvedValue(row);
      const patch = vi.spyOn(http, "patch").mockResolvedValue(row);
      await api.communities.addMember(P, "u1", "moderator");
      await api.communities.updateMemberRole(P, "u1", "moderator");
      expect(post).toHaveBeenCalledWith(
        `${BASE}/community/${P}/members/u1`,
        { role: "moderator" },
        { headers: { Authorization: "Bearer jwt" } },
      );
      expect(patch).toHaveBeenCalledWith(
        `${BASE}/community/${P}/members/u1`,
        { role: "moderator" },
        { headers: { Authorization: "Bearer jwt" } },
      );
    });

    it("addRecommendedToken omits description when not given", async () => {
      api.apiKey = "jwt";
      const post = vi
        .spyOn(http, "post")
        .mockResolvedValue({ tokenId: "2jjj" });
      await api.communities.addRecommendedToken(P, "2jjj");
      expect(post.mock.calls[0][1]).toEqual({ token: "2jjj" });
      await api.communities.addRecommendedToken(P, "2jjj", "good one");
      expect(post.mock.calls[1][1]).toEqual({
        token: "2jjj",
        description: "good one",
      });
    });

    it("surfaces the API's message on a failed request", async () => {
      api.apiKey = "jwt";
      const err = new AxiosError("Request failed with status code 409");
      err.response = {
        status: 409,
        data: { message: "Already a member" },
      } as AxiosResponse;
      vi.spyOn(http, "post").mockRejectedValue(err);
      await expect(api.communities.join(P)).rejects.toThrow("Already a member");
    });

    it("joins NestJS validation message arrays", async () => {
      api.apiKey = "jwt";
      const err = new AxiosError("Request failed with status code 400");
      err.response = {
        status: 400,
        data: {
          message: [
            "reason must be shorter than or equal to 500 characters",
            "property foo should not exist",
          ],
        },
      } as AxiosResponse;
      vi.spyOn(http, "post").mockRejectedValue(err);
      await expect(api.communities.kickMember(P, "u1", "x")).rejects.toThrow(
        "reason must be shorter than or equal to 500 characters; property foo should not exist",
      );
    });

    it("falls back to axios' message when the API gives none", async () => {
      api.apiKey = "jwt";
      const err = new AxiosError("Network Error");
      vi.spyOn(http, "delete").mockRejectedValue(err);
      await expect(api.communities.leave(P)).rejects.toThrow("Network Error");
    });
  });
});
