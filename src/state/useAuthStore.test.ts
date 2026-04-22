import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../api/auth", () => ({
  apiAuthSession: vi.fn(async () => ({ user: { id: "1", email: "a@b.com", name: null, role: "user" } })),
  apiDevLogin: vi.fn(async () => ({ token: "t" })),
}));

vi.mock("../api/client", () => ({
  getToken: vi.fn(() => "t"),
  setToken: vi.fn(),
}));

vi.mock("./persist", () => ({
  clearPersisted: vi.fn(),
}));

import { useAuthStore } from "./useAuthStore";
import { apiAuthSession } from "../api/auth";

describe("useAuthStore.bootstrap", () => {
  beforeEach(() => {
    useAuthStore.setState({ status: "unknown", user: null });
    (useAuthStore as any)._bootPromise = null;
    vi.clearAllMocks();
  });

  test("deduplicates concurrent bootstrap calls", async () => {
    const p1 = useAuthStore.getState().bootstrap();
    const p2 = useAuthStore.getState().bootstrap();
    await Promise.all([p1, p2]);

    expect(apiAuthSession).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().status).toBe("authed");
  });
});

