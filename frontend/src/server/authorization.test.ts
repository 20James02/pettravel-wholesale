import assert from "node:assert/strict";
import test from "node:test";

import { hasPermission } from "./authorization.ts";
import type { UserAccount } from "../lib/domain.ts";


test("authorization uses permissions returned by the database", () => {
  const user: UserAccount = {
    id: "user_1",
    name: "Owner",
    company: "Đại lý 1",
    organizationId: "org_1",
    email: "owner@example.com",
    role: "customer_owner",
    isAdmin: false,
    permissions: ["order.read", "order.quote"]
  };

  assert.equal(hasPermission(user, "order.quote"), true);
  assert.equal(hasPermission(user, "catalog.write"), false);
});
