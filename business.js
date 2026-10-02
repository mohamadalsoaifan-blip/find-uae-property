// Business setup decision engine (BETA). From the person's answers it explains which setup paths fit and WHY, using
// only sourced facts (official pages, summarised, dated). It never shows a fee, a timeline, an
// approval or a "best" provider: those depend on the authority, the activity and the package, and must come from the
// provider in writing. Shared by the page (business-page.js) and the tests.
(function (root) {
  "use strict";

  /**
   * @param {{activity:string, clients:string, office:string, emirate:string}} a
   * @returns {{paths: {id:string, fit:string, reasons:string[]}[], decider: (string|null), ask: string[]}}
   *   fit: "good" | "conditional" | "depends"; reasons/decider/ask are copy keys.
   */
  function paths(a) {
    a = a || {};
    var local = a.clients === "uae" || a.clients === "both";
    var abroad = a.clients === "international";
    var walkIn = a.activity === "food" || a.office === "premises";
    var mainland = { id: "mainland", fit: "depends", reasons: [] };
    var freezone = { id: "freezone", fit: "depends", reasons: [] };

    if (local || walkIn) {
      mainland.fit = "good";
      mainland.reasons.push(walkIn ? "m_walk_in" : "m_local_clients");
      freezone.fit = "conditional";
      freezone.reasons.push("f_local_needs_route");
      if (a.emirate === "dubai") freezone.reasons.push("f_dubai_permit");
    } else if (abroad) {
      freezone.fit = "good";
      freezone.reasons.push("f_international");
      mainland.fit = "depends";
      mainland.reasons.push("m_also_possible");
    } else {
      mainland.reasons.push("m_local_clients");
      freezone.reasons.push("f_international", "f_local_needs_route");
    }
    var order = mainland.fit === "good" ? [mainland, freezone] : [freezone, mainland];
    var ask = ["ask_activity", "ask_total_cost", "ask_visas_office"];
    if (local || walkIn || a.clients === "not_sure") ask.push("ask_mainland_invoicing");
    ask.push("ask_bank", "ask_refusal", "ask_tax");
    return { paths: order, decider: a.clients === "not_sure" || !a.clients ? "decide_clients" : null, ask: ask };
  }

  root.PLHBusiness = { paths: paths };
})(typeof globalThis !== "undefined" ? globalThis : window);
