// "Does this car fit what I said I need?" — compares ONE approved ad with the answers the buyer saved in the car
// guide on this device (localStorage plh_car_guide_v1). Never a ranking or "best": each need is ✓ (meets), ✗ (does
// not) or ? (the ad does not say). Needs the buyer did not answer are skipped. Pure; shared by the page and the tests.
(function (root) {
  "use strict";

  var BUDGET = {
    lt60k: [0, 60000],
    "60to100k": [60000, 100000],
    "100to150k": [100000, 150000],
    "150to250k": [150000, 250000],
    "250kplus": [250000, Infinity],
  };
  var POWER = { petrol: ["petrol", "diesel"], hybrid: ["hybrid", "plug_in_hybrid"], electric: ["electric"] };
  var MAIN_EMIRATES = ["dubai", "abu_dhabi", "sharjah"];

  /**
   * @param {{priceAed:number, emirate:string, condition?:string|null, fuel?:string|null, seats?:number|null}} ad
   * @param {Object} needs saved car-guide answers (carBudget, condition, powertrain, seats, emirate)
   * @returns {{checks: {key:string, ok:boolean|null}[], met:number, known:number}}
   */
  function fit(ad, needs) {
    needs = needs || {};
    var checks = [];
    var b = BUDGET[needs.carBudget];
    if (b) checks.push({ key: "budget", ok: ad.priceAed <= b[1] });
    if (needs.condition === "new" || needs.condition === "used") {
      checks.push({ key: "condition", ok: ad.condition ? ad.condition === needs.condition : null });
    }
    var p = POWER[needs.powertrain];
    if (p) checks.push({ key: "powertrain", ok: ad.fuel ? p.indexOf(ad.fuel) >= 0 : null });
    // "up to 5" is met by almost any car, so only 7 / 8+ seats are checked
    if (needs.seats === "seven" || needs.seats === "eight_plus") {
      var s = typeof ad.seats === "number" ? ad.seats : null;
      checks.push({ key: "seats", ok: s === null ? null : s >= (needs.seats === "seven" ? 7 : 8) });
    }
    if (needs.emirate && needs.emirate !== "not_sure") {
      checks.push({
        key: "emirate",
        ok: needs.emirate === "other" ? MAIN_EMIRATES.indexOf(ad.emirate) < 0 : ad.emirate === needs.emirate,
      });
    }
    var known = checks.filter(function (c) {
      return c.ok !== null;
    });
    return {
      checks: checks,
      met: known.filter(function (c) {
        return c.ok;
      }).length,
      known: known.length,
    };
  }

  /** The saved needs, or null when the buyer has not used the car guide on this device. */
  function savedNeeds(read) {
    try {
      var n = JSON.parse(read("plh_car_guide_v1") || "null");
      if (!n || typeof n !== "object") return null;
      var keep = {};
      ["carBudget", "condition", "powertrain", "seats", "emirate"].forEach(function (k) {
        if (typeof n[k] === "string" && /^[a-z0-9_]{2,20}$/.test(n[k])) keep[k] = n[k];
      });
      return Object.keys(keep).length ? keep : null;
    } catch (_) {
      return null;
    }
  }

  /** Adds an ad to the car comparison on this device (max 4); returns false when the comparison is full. */
  function addToCompare(read, write, ad, max) {
    var d;
    try {
      d = JSON.parse(read("plh_car_compare_v1") || "null");
    } catch (_) {
      d = null;
    }
    if (!d || !Array.isArray(d.options)) d = { options: [], shared: {}, priority: "" };
    // drop empty starter rows so the ad does not land after two blank cards
    d.options = d.options.filter(function (o) {
      return o && (o.label || o.price);
    });
    var label = String(ad.title || "").slice(0, 40);
    if (
      d.options.some(function (o) {
        return o.label === label && Number(o.price) === ad.priceAed;
      })
    ) return true;
    if (d.options.length >= (max || 4)) return false;
    d.options.push({
      label: label,
      price: ad.priceAed,
      powertrain: ad.fuel === "electric" ? "electric" : ad.fuel === "hybrid" || ad.fuel === "plug_in_hybrid" ? "hybrid" : "petrol",
      seats: typeof ad.seats === "number" ? ad.seats : null,
    });
    write("plh_car_compare_v1", JSON.stringify(d));
    return true;
  }

  /**
   * What to check before paying, chosen from facts in the ad only (age, mileage, condition, engine, specs). Keys;
   * the page shows the sentence for each. Generic good practice — never a statement about this particular car.
   * @param {{year?:number|null, mileageKm?:number|null, condition?:string|null, fuel?:string|null, regionalSpecs?:string|null}} ad
   * @param {number} thisYear
   */
  function checklist(ad, thisYear) {
    var out = ["papers", "service_history", "accident_history", "inspection", "test_drive", "finance_clearance"];
    var age = typeof ad.year === "number" ? thisYear - ad.year : null;
    var km = typeof ad.mileageKm === "number" ? ad.mileageKm : null;
    if (ad.condition === "new") out.push("warranty_start");
    else if ((age !== null && age >= 5) || (km !== null && km >= 100000)) out.push("wear_items");
    if (km !== null && km >= 150000) out.push("major_service");
    if (ad.fuel === "electric" || ad.fuel === "hybrid" || ad.fuel === "plug_in_hybrid") out.push("battery_health");
    if (ad.regionalSpecs && ad.regionalSpecs !== "gcc" && ad.regionalSpecs !== "unknown") out.push("non_gcc");
    out.push("pay_safely", "transfer");
    return out;
  }

  root.PLHListingFit = { fit: fit, savedNeeds: savedNeeds, addToCompare: addToCompare, checklist: checklist };
})(typeof globalThis !== "undefined" ? globalThis : window);
