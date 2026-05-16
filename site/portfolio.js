const titleFrames = [
  "Portfolio",
  "Portfolio | Entry-Level",
  "Portfolio | Entry-Level Animal Care",
  "Portfolio | Entry-Level Animal Care, Creative & Digital Work"
];

const gsapCoreSrc = "https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js";
const gsapScrollTriggerSrc = "https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollTrigger.min.js";

let portfolioTitleTypewriterTimer = 0;
let portfolioTitleTypewriterToken = 0;
const defaultTitleTypewriterDelayMs = 2_000;
const titleTypewriterDelayMs = (() => {
  const override = Number(window.__internetAngelTitleTypewriterDelayMs);
  return Number.isFinite(override) && override >= 0 ? override : defaultTitleTypewriterDelayMs;
})();

window.__internetAngelResolvedTitleTypewriterDelayMs = titleTypewriterDelayMs;

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

function startDocumentTitleTypewriter(frames = titleFrames) {
  const safeFrames = (Array.isArray(frames) ? frames : [])
    .map((frame) => String(frame || "").trim())
    .filter(Boolean);
  if (!safeFrames.length) return;

  const token = ++portfolioTitleTypewriterToken;
  let index = 0;
  if (portfolioTitleTypewriterTimer) {
    window.clearTimeout(portfolioTitleTypewriterTimer);
    portfolioTitleTypewriterTimer = 0;
  }

  const finalTitle = safeFrames[safeFrames.length - 1];
  const schedule = (callback, delayMs) => {
    portfolioTitleTypewriterTimer = window.setTimeout(() => {
      if (token !== portfolioTitleTypewriterToken) return;
      callback();
    }, delayMs);
  };

  const writeNext = () => {
    if (token !== portfolioTitleTypewriterToken) return;
    const nextTitle = safeFrames[index] || finalTitle;
    document.title = nextTitle;
    window.__internetAngelTitleTypewriterFrame = nextTitle;
    window.__internetAngelTitleTypewriterDone = nextTitle === finalTitle;
    index = (index + 1) % safeFrames.length;
    schedule(writeNext, titleTypewriterDelayMs);
  };

  window.__internetAngelTitleTypewriterDone = false;
  writeNext();
}

function loadExternalScript(src) {
  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${src}"]`);
    if (existingScript) {
      existingScript.addEventListener("load", resolve, { once: true });
      existingScript.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
}

async function loadGsapStack() {
  if (window.gsap) return true;

  try {
    await loadExternalScript(gsapCoreSrc);
    await loadExternalScript(gsapScrollTriggerSrc);
    return Boolean(window.gsap);
  } catch {
    return false;
  }
}

function markAllRevealItemsVisible() {
  document.querySelectorAll(".reveal").forEach((item) => {
    item.classList.add("is-visible");
  });
}

function enhanceRevealMotionFallback() {
  const revealItems = Array.from(document.querySelectorAll(".reveal"));
  if (!revealItems.length) return;
  if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
    markAllRevealItemsVisible();
    return;
  }

  document.body.classList.add("has-reveal");
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, {
    rootMargin: "0px 0px -10% 0px",
    threshold: 0.12
  });

  revealItems.forEach((item) => observer.observe(item));
}

function enhanceGsapMotion() {
  const gsap = window.gsap;
  if (!gsap) {
    enhanceRevealMotionFallback();
    return;
  }

  if (window.ScrollTrigger) {
    gsap.registerPlugin(window.ScrollTrigger);
  }

  document.body.classList.add("gsap-ready");
  window.__internetAngelPortfolioMotion = window.ScrollTrigger ? "gsap-scrolltrigger" : "gsap";

  const heroTimeline = gsap.timeline({
    defaults: { duration: 0.9, ease: "power3.out" }
  });

  heroTimeline
    .from(".portfolio-eyebrow", { autoAlpha: 0, y: 18, duration: 0.5 })
    .from("#portfolio-title", { autoAlpha: 0, y: 44 }, "-=0.25")
    .from(".portfolio-hero-lede, .portfolio-hero-intro", {
      autoAlpha: 0,
      y: 24,
      stagger: 0.1,
      duration: 0.62
    }, "-=0.38")
    .from(".portfolio-actions .portfolio-button, .portfolio-note", {
      autoAlpha: 0,
      y: 18,
      stagger: 0.06,
      duration: 0.52
    }, "-=0.25")
    .from(".hero-index", { autoAlpha: 0, x: 30, duration: 0.72 }, "-=0.58");

  const marqueeTrack = document.querySelector(".hero-marquee-track");
  if (marqueeTrack) {
    const halfTrackWidth = marqueeTrack.scrollWidth / 2;
    gsap.to(marqueeTrack, {
      x: -halfTrackWidth,
      duration: 32,
      ease: "none",
      repeat: -1
    });
  }

  if (window.ScrollTrigger) {
    gsap.to(".cinema-word", {
      y: -86,
      ease: "none",
      scrollTrigger: {
        trigger: ".portfolio-hero",
        start: "top top",
        end: "bottom top",
        scrub: true
      }
    });

    gsap.utils.toArray(".reveal").forEach((section) => {
      gsap.fromTo(section, {
        autoAlpha: 0,
        y: 44
      }, {
        autoAlpha: 1,
        y: 0,
        duration: 0.86,
        ease: "power3.out",
        scrollTrigger: {
          trigger: section,
          start: "top 82%",
          once: true
        }
      });

      const children = section.querySelectorAll(".strength-card, .project-card, .skill-group, .timeline-item");
      if (children.length) {
        gsap.fromTo(children, {
          autoAlpha: 0,
          y: 26
        }, {
          autoAlpha: 1,
          y: 0,
          duration: 0.62,
          ease: "power3.out",
          stagger: 0.055,
          scrollTrigger: {
            trigger: section,
            start: "top 78%",
            once: true
          }
        });
      }
    });
    return;
  }

  markAllRevealItemsVisible();
}

async function enhancePortfolioMotion() {
  if (prefersReducedMotion()) {
    window.__internetAngelPortfolioMotion = "reduced";
    markAllRevealItemsVisible();
    return;
  }

  const gsapReady = await loadGsapStack();
  if (gsapReady) {
    enhanceGsapMotion();
    return;
  }

  window.__internetAngelPortfolioMotion = "fallback";
  enhanceRevealMotionFallback();
}

startDocumentTitleTypewriter();
enhancePortfolioMotion();
