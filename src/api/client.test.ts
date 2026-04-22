import { describe, expect, it, vi, beforeEach } from "vitest";
import { apiFetch, ApiError, setToken } from "./client";

describe("apiFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setToken(null);
  });

  it("throws ApiError with parsed json error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify({ error: "email_not_allowed" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    await expect(apiFetch("/auth/dev-login", { method: "POST", body: "{}" })).rejects.toBeInstanceOf(ApiError);
  });

  it("throws AuthRequiredError on mutation without token", async () => {
    const { AuthRequiredError } = await import("./client");
    await expect(apiFetch("/eventos/1", { method: "PATCH", body: "{}" })).rejects.toBeInstanceOf(AuthRequiredError);
  });
});

