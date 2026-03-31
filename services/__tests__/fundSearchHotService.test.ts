import test from "node:test";
import assert from "node:assert/strict";
import { recordFundSearchHotWithRepo } from "@/services/fundSearchHotService";

test("recordFundSearchHot should use atomic upsert with increment", async () => {
  let called = false;
  let updateCountIncrement: number | undefined;
  const fakeRepo = {
    upsert: async (args: {
      update?: { count?: { increment?: number } };
    }) => {
      called = true;
      updateCountIncrement = args.update?.count?.increment;
      return null as never;
    },
  };

  await recordFundSearchHotWithRepo(fakeRepo as never, "u1", "000001");
  assert.equal(called, true);
  assert.equal(updateCountIncrement, 1);
});
