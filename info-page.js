// Pages without their own request form (guides, property calculators, comparison): remember where the visitor came
// from (?ref= / utm / referrer, via page-common.js) so a request made later on another page keeps its source, and
// send one anonymous PAGE_VIEW. Nothing typed on the page is ever sent.
(function () {
  "use strict";
  var P = window.PLHPage;
  var ctx = P ? P.start() : null;
  if (ctx) ctx.track("PAGE_VIEW");
})();
