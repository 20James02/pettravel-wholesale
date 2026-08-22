type MotionCleanup = () => void;

const noCleanup: MotionCleanup = () => undefined;

export async function mountCatalogIntroMotion(root: HTMLElement): Promise<MotionCleanup> {
  if (!root.isConnected || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return noCleanup;
  }

  const { gsap } = await import("gsap");
  if (!root.isConnected) return noCleanup;

  const media = gsap.matchMedia(root);
  media.add(
    {
      desktop: "(min-width: 768px)",
      reduceMotion: "(prefers-reduced-motion: reduce)"
    },
    (context) => {
      const conditions = context.conditions as { desktop: boolean; reduceMotion: boolean };
      if (conditions.reduceMotion) return;

      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .fromTo(
          '[data-gsap="hero"]',
          { autoAlpha: 0, y: conditions.desktop ? 24 : 14 },
          { autoAlpha: 1, y: 0, duration: 0.55 }
        )
        .fromTo(
          '[data-gsap="hero-item"]',
          { autoAlpha: 0, y: 10 },
          { autoAlpha: 1, y: 0, duration: 0.35, stagger: 0.06 },
          "-=0.28"
        )
        .fromTo(
          '[data-gsap="filters"]',
          { autoAlpha: 0, y: 8 },
          { autoAlpha: 1, y: 0, duration: 0.3 },
          "-=0.18"
        );
    }
  );

  return () => media.revert();
}

export async function mountCatalogProductMotion(root: HTMLElement): Promise<MotionCleanup> {
  if (!root.isConnected || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return noCleanup;
  }

  const { gsap } = await import("gsap");
  if (!root.isConnected) return noCleanup;

  const context = gsap.context(() => {
    gsap.fromTo(
      '[data-gsap="product-card"]',
      { autoAlpha: 0, y: 18, scale: 0.985 },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.42,
        ease: "power2.out",
        stagger: { each: 0.055, from: "start" }
      }
    );
  }, root);

  return () => context.revert();
}
