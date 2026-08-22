import assert from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("GSAP catalog integration", () => {
  it("loads GSAP lazily and cleans up every animation context", () => {
    const motionSource = readFileSync(new URL("./gsap-catalog-motion.ts", import.meta.url), "utf8");
    const catalogSource = readFileSync(
      new URL("../../features/pettravel/components/customer/Catalog.tsx", import.meta.url),
      "utf8"
    );

    assert.ok(motionSource.includes('await import("gsap")'));
    assert.ok(motionSource.includes('gsap.matchMedia(root)'));
    assert.ok(motionSource.includes('media.revert()'));
    assert.ok(motionSource.includes('context.revert()'));
    assert.ok(motionSource.includes('prefers-reduced-motion: reduce'));
    assert.ok(motionSource.includes("MAX_STAGGERED_PRODUCT_CARDS"));
    assert.ok(motionSource.includes("gsap.set(remainingCards"));
    assert.ok(catalogSource.includes('import("@/lib/motion/gsap-catalog-motion")'));
  });

  it("keeps heavy optional libraries out of static PetTravelApp imports", () => {
    const appSource = readFileSync(
      new URL("../../features/pettravel/PetTravelApp.tsx", import.meta.url),
      "utf8"
    );

    assert.ok(!appSource.includes('import Lenis from "lenis"'));
    assert.ok(!appSource.includes('from "@/lib/validation"'));
    assert.ok(appSource.includes('await import("lenis")'));
    assert.ok(appSource.includes('cancelAnimationFrame(animationFrameId)'));
  });
});
