// Applies the saved accent colour / density BEFORE first paint (loaded in <head>),
// so the popup never flashes the default blue. appearance.js keeps it in sync.
(function () {
  try {
    var a = localStorage.getItem("saathiAccent"), d = localStorage.getItem("saathiDensity");
    if (a) document.documentElement.setAttribute("data-accent", a);
    if (d) document.documentElement.setAttribute("data-density", d);
  } catch (e) { /* storage blocked — default look */ }
})();
