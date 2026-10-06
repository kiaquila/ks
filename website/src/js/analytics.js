(() => {
  if (location.hostname !== "ks-design.art") return;

  window.plausible = window.plausible || function () {
    (window.plausible.q = window.plausible.q || []).push(arguments);
  };
  document.addEventListener("click", (event) => {
    const link = event.target.closest?.("a[data-contact]");
    if (link) window.plausible(`Contact ${link.dataset.contact}`);
  });

  const start = () => {
    const script = document.createElement("script");
    script.src = "/stats/script.js";
    script.defer = true;
    script.dataset.domain = "ks-design.art";
    script.dataset.api = "/stats/event";
    document.head.append(script);
  };
  // Keep the tracker out of the first paint and page-load critical path.
  const schedule = () => {
    if (window.requestIdleCallback) window.requestIdleCallback(start, { timeout: 1500 });
    else setTimeout(start, 0);
  };
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
})();
