interface CartFlyMotionOptions {
  sourceElement: HTMLElement | null;
  imageUrl?: string;
}

const CART_TARGET_SELECTOR = '[data-cart-animation-target="true"]';

function findVisibleCartTarget(): HTMLElement | null {
  const targets = Array.from(document.querySelectorAll<HTMLElement>(CART_TARGET_SELECTOR));
  return targets.find((target) => {
    const rect = target.getBoundingClientRect();
    const style = window.getComputedStyle(target);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }) ?? null;
}

function resolveSourceRect(sourceElement: HTMLElement): DOMRect {
  const sourceImage = sourceElement.querySelector<HTMLElement>("img");
  return (sourceImage ?? sourceElement).getBoundingClientRect();
}

export async function animateProductToCart({
  sourceElement,
  imageUrl
}: CartFlyMotionOptions): Promise<void> {
  if (!sourceElement?.isConnected || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const target = findVisibleCartTarget();
  if (!target) return;

  const sourceRect = resolveSourceRect(sourceElement);
  const targetRect = target.getBoundingClientRect();
  if (sourceRect.width <= 0 || sourceRect.height <= 0) return;

  try {
    const { gsap } = await import("gsap");
    if (!target.isConnected) return;

    const startSize = Math.min(140, Math.max(72, Math.min(sourceRect.width, sourceRect.height)));
    const startLeft = sourceRect.left + sourceRect.width / 2 - startSize / 2;
    const startTop = sourceRect.top + sourceRect.height / 2 - startSize / 2;
    const deltaX = targetRect.left + targetRect.width / 2 - (startLeft + startSize / 2);
    const deltaY = targetRect.top + targetRect.height / 2 - (startTop + startSize / 2);
    const arcLift = Math.min(190, Math.max(80, Math.abs(deltaX) * 0.18));

    const flyer = document.createElement(imageUrl ? "img" : "div");
    flyer.setAttribute("aria-hidden", "true");
    if (flyer instanceof HTMLImageElement && imageUrl) {
      flyer.src = imageUrl;
      flyer.alt = "";
      flyer.style.objectFit = "contain";
    } else {
      flyer.style.background = "linear-gradient(135deg, #fff7ed, #f97316)";
    }

    Object.assign(flyer.style, {
      position: "fixed",
      left: `${startLeft}px`,
      top: `${startTop}px`,
      width: `${startSize}px`,
      height: `${startSize}px`,
      zIndex: "2147483647",
      pointerEvents: "none",
      borderRadius: "22%",
      filter: "drop-shadow(0 12px 18px rgba(124, 45, 18, 0.28))",
      willChange: "transform, opacity"
    });
    document.body.appendChild(flyer);

    gsap
      .timeline({
        onComplete: () => flyer.remove(),
        onInterrupt: () => flyer.remove()
      })
      .fromTo(
        flyer,
        { x: 0, y: 0, scale: 1, rotation: -4, autoAlpha: 0.98 },
        {
          x: deltaX * 0.52,
          y: deltaY * 0.34 - arcLift,
          scale: 0.62,
          rotation: 9,
          duration: 0.34,
          ease: "power2.out"
        }
      )
      .to(flyer, {
        x: deltaX,
        y: deltaY,
        scale: 0.06,
        rotation: 22,
        autoAlpha: 0.35,
        duration: 0.44,
        ease: "power3.in"
      })
      .fromTo(
        target,
        { scale: 1 },
        { scale: 1.12, duration: 0.12, yoyo: true, repeat: 1, ease: "power2.out" },
        "-=0.08"
      )
      .set(target, { clearProps: "transform" });
  } catch {
    // Adding to the cart has already succeeded; motion failure must never roll it back.
  }
}
