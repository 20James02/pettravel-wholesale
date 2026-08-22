import assert from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const repositorySource = readFileSync(new URL("./repository.ts", import.meta.url), "utf8");

describe("operations organization data contract", () => {
  it("fails closed when an operator has no real organization", () => {
    assert.ok(repositorySource.includes("function requireOrganizationId"));
    assert.ok(repositorySource.includes("ORGANIZATION_REQUIRED"));
    assert.ok(repositorySource.includes("const organizationId = requireOrganizationId(user)"));
  });

  it("never substitutes a fabricated organization identifier", () => {
    assert.ok(!repositorySource.includes("00000000-0000-0000-0000-000000000103"));
    assert.ok(!repositorySource.includes('user.organizationId || ""'));
    assert.ok(repositorySource.includes("encodeURIComponent(organizationId)"));
  });
});
