/* Two World demo view: the 100-agent panel sits right after the prompt, above the 3D view, because
 * everything under the 3D view is hidden in the demo view (two-world.css). Researcher view keeps
 * view-mode.js's order. Layout only; no run logic. */
(function () {
  'use strict';
  function place() {
    const poll = document.getElementById('agentPoll'), intro = document.getElementById('intro');
    const demo = !window.CounterfactualView || window.CounterfactualView.isDemo();
    if (demo && poll && intro && intro.nextElementSibling !== poll) intro.after(poll);
  }
  place();
  document.addEventListener('DOMContentLoaded', place);   // after view-mode.js's own DOMContentLoaded placement
  window.addEventListener('counterfactual:view', place);
})();
