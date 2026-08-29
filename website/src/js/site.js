/* Progressive enhancement only.

   Every feature here upgrades something that already works without it: the nav
   is a visible list until this script can collapse and reopen it, the carousel
   is a native scroll container until this script can add buttons to it, and
   the portrait swaps on hover in CSS. Nothing is hidden in the markup waiting
   for JavaScript to reveal it. */

(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const scrollBehavior = () => (reduceMotion.matches ? "auto" : "smooth");

  const slides = document.querySelectorAll(".slide");

  /* --- header shadow ----------------------------------------------------- */

  const header = document.querySelector("[data-header]");
  if (header) {
    let ticking = false;
    const sync = () => {
      header.toggleAttribute("data-scrolled", window.scrollY > 8);
      ticking = false;
    };
    /* The listener only raises a flag; the read happens in the frame, so a
       fast flick costs one layout read rather than one per scroll event. */
    addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(sync);
      },
      { passive: true }
    );
    sync();
  }

  /* --- the language switch keeps your place ------------------------------- */

  /* Switching language mid-page used to land the reader back at the top. The
     section ids are the same in every locale, so the switch only needs the
     current slide's id appended to its href — resolved when the reader
     reaches for it, not on every scroll frame, so it costs nothing while
     reading and survives a background tab. */
  const langSwitch = document.querySelector(".lang-switch");
  if (langSwitch && slides.length) {
    const roots = new Map(
      [...langSwitch.querySelectorAll("a[href]")].map((link) => [
        link,
        link.getAttribute("href")
      ])
    );
    const stamp = () => {
      /* The slide crossing the middle of the viewport is the one being
         read. The hero has no id, and lands at the top. */
      const middle = window.innerHeight / 2;
      let current = "";
      for (const slide of slides) {
        const box = slide.getBoundingClientRect();
        if (box.top <= middle && box.bottom > middle) {
          current = slide.id;
          break;
        }
      }
      for (const [link, root] of roots) {
        link.setAttribute("href", current ? `${root}#${current}` : root);
      }
    };
    for (const type of ["pointerdown", "focusin", "click"]) {
      langSwitch.addEventListener(type, stamp);
    }

    /* And the arrival: the browser's own fragment scroll is animated, and a
       tab that is not yet visible suspends it, so the reader lands at the top
       after all. Repeating the jump without animation makes it deterministic.
       The id is matched against the page's slides rather than handed to a
       selector, so a hand-typed fragment cannot become one. */
    const land = () => {
      const wanted = location.hash.slice(1);
      if (!wanted) return;
      for (const slide of slides) {
        if (slide.id !== wanted) continue;
        const root = document.documentElement;
        const previous = root.style.scrollBehavior;
        root.style.scrollBehavior = "auto";
        slide.scrollIntoView();
        root.style.scrollBehavior = previous;
        return;
      }
    };
    land();
    /* Again after load: the browser runs its own fragment scroll around then,
       and it wins whatever this script did during parsing. */
    addEventListener("load", land);
  }

  /* --- mobile navigation -------------------------------------------------- */

  const nav = document.querySelector("#site-nav");
  const toggle = document.querySelector("[data-nav-toggle]");

  if (nav && toggle) {
    /* Collapsing is claimed only now, once there is something that can undo
       it. Before this line the nav is a plain visible list. */
    nav.setAttribute("data-collapsed", "");

    /* Taking the closed menu out of the tab order is the stylesheet's job —
       see the `visibility` rule in layout.css — so no JS-held copy of the
       breakpoint can fall out of step with the CSS. */
    const setOpen = (open, restoreToggleFocus = true) => {
      /* Focus must leave before the subtree becomes unfocusable, or it is
         stranded on an element nothing can reach again. */
      if (!open && restoreToggleFocus && nav.contains(document.activeElement)) {
        toggle.focus();
      }
      nav.toggleAttribute("data-open", open);
      toggle.setAttribute("aria-expanded", String(open));
    };

    toggle.addEventListener("click", () => {
      const open = !nav.hasAttribute("data-open");
      setOpen(open);
      /* The nav sits before the toggle, so Tab from the button would carry
         on past the menu it just opened. */
      if (open) nav.querySelector("a")?.focus();
    });

    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) setOpen(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && nav.hasAttribute("data-open")) {
        setOpen(false);
        toggle.focus();
      }
    });

    /* Both directions: narrowing must move focus off a nav link the CSS is
       about to hide; widening must not move it to the hidden toggle. */
    window
      .matchMedia("(min-width: 900px)")
      .addEventListener("change", (event) => {
        if (event.matches && document.activeElement === toggle) {
          nav.querySelector("a")?.focus();
        }
        setOpen(false, !event.matches);
      });
  }

  /* --- work carousel ------------------------------------------------------ */

  const track = document.querySelector("[data-carousel-track]");
  const carousel = document.querySelector("[data-carousel]");

  if (track && carousel) {
    const prev = carousel.querySelector("[data-carousel-prev]");
    const next = carousel.querySelector("[data-carousel-next]");

    /* One press moves exactly one card: the first card's box plus the gap. */
    const step = () => {
      const card = track.firstElementChild;
      if (!card) return Math.max(track.clientWidth, 1);
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return card.getBoundingClientRect().width + gap;
    };

    /* Chrome refuses a smooth programmatic scroll inside a nested scroller
       while the document itself snaps, so the glide is animated by hand onto
       a card boundary — which is where the snap points are. */
    const glide = (direction) => {
      const size = step();
      const max = track.scrollWidth - track.clientWidth;
      const to = Math.max(
        0,
        Math.min(Math.round(track.scrollLeft / size + direction) * size, max)
      );
      if (scrollBehavior() === "auto") {
        track.scrollLeft = to;
        return;
      }
      const from = track.scrollLeft;
      const start = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - start) / 320);
        track.scrollLeft = from + (to - from) * (1 - (1 - p) ** 3);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    /* The arrows sit on the shots' centre, not the whole card's. */
    const alignArrows = () => {
      const shot = track.querySelector(".work-shot");
      if (!shot) return;
      const box = carousel.getBoundingClientRect();
      const shotBox = shot.getBoundingClientRect();
      const top = `${shotBox.top - box.top + shotBox.height / 2}px`;
      prev.style.top = top;
      next.style.top = top;
    };

    const sync = () => {
      const max = track.scrollWidth - track.clientWidth;
      /* With few projects the track does not overflow, and two dead arrows
         read as breakage. */
      const overflows = max > 4;
      prev.hidden = !overflows;
      next.hidden = !overflows;
      if (!overflows) return;
      prev.disabled = track.scrollLeft <= 4;
      next.disabled = track.scrollLeft >= max - 4;
      alignArrows();
    };

    prev.addEventListener("click", () => glide(-1));
    next.addEventListener("click", () => glide(1));

    let scrollTick = false;
    track.addEventListener(
      "scroll",
      () => {
        if (scrollTick) return;
        scrollTick = true;
        requestAnimationFrame(() => {
          sync();
          scrollTick = false;
        });
      },
      { passive: true }
    );

    /* Card widths are percentages, so a resize changes both the page size
       and whether the track overflows. */
    if ("ResizeObserver" in window) {
      new ResizeObserver(sync).observe(track);
    } else {
      addEventListener("resize", sync, { passive: true });
    }

    sync();
  }

  /* --- soft slide reveals -------------------------------------------------- */

  /* The hidden initial state is claimed here, not in the markup: a visitor
     without JavaScript (or with reduced motion) gets every slide fully
     visible, because the CSS only hides content under `html.reveal-on`. */
  if (slides.length && "IntersectionObserver" in window && !reduceMotion.matches) {
    document.documentElement.classList.add("reveal-on");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          entry.target.classList.toggle("in-view", entry.isIntersecting);
        }
      },
      { threshold: 0.2 }
    );
    slides.forEach((slide) => io.observe(slide));
  }

  /* --- portrait swap on touch --------------------------------------------- */

  const portrait = document.querySelector("[data-portrait]");
  if (portrait) {
    const canHover = window.matchMedia("(hover: hover)");

    portrait.addEventListener("click", () => {
      /* Pointer devices already swap on hover; a click there would fight it. */
      if (canHover.matches) return;
      portrait.toggleAttribute("data-active");
      /* A tap also focuses the frame, and `:focus-within` would then hold
         the swap on regardless of the attribute — the second tap seemed to
         do nothing. Switching off therefore drops the tap's focus too, so
         the taps read on/off/on the way a toggle should. */
      if (!portrait.hasAttribute("data-active")) portrait.blur();
    });

    /* The frame is focusable so the swap is reachable from the keyboard, which
       means it also needs to answer to Enter and Space like a control. */
    portrait.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      portrait.toggleAttribute("data-active");
    });

    /* Leaving the portrait clears the toggled state; focus inside the notes
       keeps them up through :focus-within anyway. */
    portrait.addEventListener("blur", () => {
      portrait.removeAttribute("data-active");
    });
  }
})();
