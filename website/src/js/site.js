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

  /* --- work filmstrip ----------------------------------------------------- */

  /* Above 900px the track becomes the filmstrip (client pick, 2026-09-11):
     the stylesheet places each card by its slot from the centre (`data-s`),
     this only decides the slots. Below that width the track stays the native
     scroller the markup ships, and a thumbnail's link is just a link. */
  const track = document.querySelector("[data-carousel-track]");
  const carousel = document.querySelector("[data-carousel]");
  const strip = window.matchMedia("(min-width: 900px)");

  if (track && carousel) {
    const cards = [...track.children];
    const n = cards.length;
    const prev = carousel.querySelector("[data-carousel-prev]");
    const next = carousel.querySelector("[data-carousel-next]");
    const count = carousel.querySelector("[data-carousel-count]");
    const slot = cards.map(() => 0);
    let active = 0;

    const place = (i, s) => {
      slot[i] = s;
      cards[i].dataset.s = s;
    };

    /* Forward, the slots run −3…2 so the leaving card fades out on the left;
       backward, −2…3 so it leaves on the right. A card whose slot would move
       against the flow is the one entering from the far side: it is parked in
       the wings first, without transition, so it slides in rather than
       crossing the stage. */
    const go = (target, dir) => {
      active = (target + n) % n;
      cards.forEach((card, i) => {
        let s = (i - active + n) % n;
        if (s > (dir > 0 ? 2 : 3)) s -= n;
        if (dir > 0 ? s > slot[i] : s < slot[i]) {
          card.classList.add("no-tr");
          place(i, dir * 3);
          void card.offsetWidth;
          card.classList.remove("no-tr");
        }
        place(i, s);
      });
      count.textContent = `${active + 1}/${n}`;
    };

    /* A thumbnail brings its project to the centre; the centre one opens
       the site. The flow follows the side the thumbnail is seen on, not its
       index: past the end of the list the two disagree. */
    cards.forEach((card, i) => {
      card.addEventListener("click", (event) => {
        if (!strip.matches || i === active) return;
        event.preventDefault();
        go(i, slot[i] > 0 ? 1 : -1);
      });
    });

    prev.addEventListener("click", () => go(active - 1, -1));
    next.addEventListener("click", () => go(active + 1, 1));
    /* Arrow keys step only while the track itself is focused: from a focused
       thumbnail they would send that very card into the hidden wings. */
    track.addEventListener("keydown", (event) => {
      if (!strip.matches || event.target !== track) return;
      if (event.key === "ArrowLeft") go(active - 1, -1);
      if (event.key === "ArrowRight") go(active + 1, 1);
    });

    /* The slots are set before the strip is switched on, so the first layout
       lands in place instead of sliding in. */
    go(0, 1);
    /* Widening onto the strip can hide the very card the keyboard is on
       (the one bound for the wings); focus moves to the track first. */
    const sync = () => {
      const focused = document.activeElement?.closest(".work-card");
      if (strip.matches && focused && Math.abs(slot[cards.indexOf(focused)]) > 2) track.focus();
      carousel.toggleAttribute("data-strip", strip.matches);
      prev.hidden = next.hidden = !strip.matches;
    };
    strip.addEventListener("change", sync);
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

    /* Leaving the portrait clears the toggled state. Keyboard focus on the
       frame still keeps the notes up through :focus-within. */
    portrait.addEventListener("blur", () => {
      portrait.removeAttribute("data-active");
    });
  }
})();
