import { describe, expect, test, vi } from "vitest";
import { withRetry } from "./retry";

describe("withRetry", () => {
  test("returns value on first try", async () => {
    const fn = vi.fn(async () => "ok");
    const res = await withRetry(fn, { attempts: 3, baseDelayMs: 1 });
    expect(res).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("retries transient failures then succeeds", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("network_error"))
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce("ok");

    const res = await withRetry(fn, { attempts: 5, baseDelayMs: 1, jitterRatio: 0 });
    expect(res).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("does not retry when shouldRetry returns false", async () => {
    const fn = vi.fn(async () => {
      throw new Error("nope");
    });

    await expect(
      withRetry(fn, {
        attempts: 3,
        baseDelayMs: 1,
        jitterRatio: 0,
        shouldRetry: () => false,
      }),
    ).rejects.toThrow("nope");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

