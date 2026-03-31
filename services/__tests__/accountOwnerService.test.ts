import test from "node:test";
import assert from "node:assert/strict";
import { updateAccountOwnerWithDb } from "@/services/accountOwnerService";

test("updateAccountOwner should perform rename in a transaction", async () => {
  let transactionCalled = false;
  const fakeDb = {
    accountOwner: {
      findFirst: async () => ({
        id: "owner_1",
        userId: "u1",
        name: "旧归属人",
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    },
    account: {
      updateMany: async () => ({ count: 2 }),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      transactionCalled = true;
      const tx = {
        account: {
          updateMany: async () => ({ count: 2 }),
        },
        accountOwner: {
          update: async () => ({
            id: "owner_1",
            userId: "u1",
            name: "新归属人",
            sortOrder: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
      };
      return fn(tx);
    },
  };

  const updated = await updateAccountOwnerWithDb(
    fakeDb as never,
    "u1",
    "owner_1",
    { name: "新归属人" },
  );
  assert.equal(transactionCalled, true);
  assert.equal(updated?.name, "新归属人");
});
