// Car decision engine. From the person's answers it explains WHAT KIND of car fits and WHY, flags conflicts in the
// stated needs, and lists what to verify before paying. Deterministic and local (runs in the browser, sends nothing).
// It never names a price, a specification, a warranty term, a finance rate or a "best" model: we hold no car
// listings, and those facts must come from the dealer in writing. Shared by the page (cars-page.js) and the tests.
(function (root) {
  "use strict";

  /**
   * @param {{condition?:string, body?:string, seats?:string, powertrain?:string, usage?:string, priority?:string,
   *          carBudget?:string, payment?:string}} a
   * @returns {{fit: {id:string, why:string[]}[], warn: string[], checks: string[], missing: string[]}}
   *   fit: the kinds of car that match (id = copy key) with reasons (copy keys); warn: conflicts in the stated needs;
   *   checks: what to verify with the dealer, most important first; missing: questions still worth answering.
   */
  function advise(a) {
    a = a || {};
    var fit = [];
    var warn = [];
    var big = a.seats === "seven" || a.seats === "eight_plus";
    var rough = a.usage === "offroad";

    // body type: from seats and use first, then the stated preference
    if (a.seats === "eight_plus") {
      fit.push({ id: "fit_mpv_large_suv", why: ["why_eight_seats"] });
    } else if (big) {
      fit.push({ id: rough ? "fit_7seat_4x4" : "fit_7seat_suv_mpv", why: ["why_seven_seats"].concat(rough ? ["why_offroad"] : []) });
    } else if (rough) {
      fit.push({ id: "fit_4x4", why: ["why_offroad"] });
    } else if (a.body && a.body !== "not_sure") {
      fit.push({ id: "fit_" + a.body, why: ["why_your_choice"] });
    } else if (a.usage === "city") {
      fit.push({ id: "fit_compact", why: ["why_city"] });
    }
    if (big && (a.body === "sedan" || a.body === "hatchback")) warn.push("warn_seats_body");
    if (rough && a.body && ["sedan", "hatchback", "mpv"].indexOf(a.body) >= 0) warn.push("warn_offroad_body");

    // powertrain: what the stated driving pattern favours, never a claim about a specific model
    var p = { id: "pt", why: [] };
    if (a.powertrain === "electric") {
      p.id = "pt_electric";
      p.why.push("why_ev_charging");
      if (a.usage === "highway" || rough) warn.push("warn_ev_range");
    } else if (a.powertrain === "hybrid") {
      p.id = "pt_hybrid";
      p.why.push(a.usage === "city" ? "why_hybrid_city" : "why_hybrid_general");
    } else if (a.powertrain === "petrol") {
      p.id = "pt_petrol";
      p.why.push(rough || a.usage === "highway" ? "why_petrol_distance" : "why_petrol_general");
    } else if (a.usage === "city" || a.priority === "economy") {
      p.id = "pt_consider_hybrid_ev";
      p.why.push("why_city_economy");
    } else if (rough || a.usage === "highway") {
      p.id = "pt_consider_petrol_hybrid";
      p.why.push("why_petrol_distance");
    }
    if (p.why.length) fit.push(p);

    // what to verify, most important first for this person
    var checks = ["chk_total_price"];
    if (a.condition === "used" || a.condition === "either") checks.push("chk_history", "chk_inspection", "chk_spec");
    if (a.condition === "new" || a.condition === "either") checks.push("chk_warranty_new");
    if (a.priority === "warranty" && a.condition === "used") checks.push("chk_warranty_used");
    if (a.payment === "finance" || a.payment === "not_sure") checks.push("chk_finance");
    if (a.powertrain === "electric") checks.push("chk_ev_battery");
    checks.push("chk_insurance", "chk_in_writing");

    var missing = [];
    ["seats", "usage", "condition", "carBudget", "payment"].forEach(function (k) {
      if (!a[k] || a[k] === "not_sure") missing.push(k);
    });
    return { fit: fit, warn: warn, checks: checks, missing: missing };
  }

  root.PLHCars = { advise: advise };
})(typeof globalThis !== "undefined" ? globalThis : window);
