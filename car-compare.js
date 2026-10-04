// Car comparison: up to 4 cars the person found anywhere (dealer, marketplace, ad), using the numbers THEY type. We
// hold no listings, so we never show, price, rate or rank cars ourselves. From their figures we compute the yearly
// running cost and the cost over the years they will keep the car, mark the lowest/highest on each metric, and say
// which option matches the ONE priority they chose — never "best". Unknown values stay unknown (never filled in).
// Shared by the page (car-compare-page.js) and the tests.
(function (root) {
  "use strict";
  var MAX_OPTIONS = 4;

  function num(v) {
    var n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(/[,\s]/g, ""));
    return isFinite(n) && n >= 0 ? n : null;
  }

  /** One option exactly as typed. `energy` = litres/100 km (petrol, hybrid) or kWh/100 km (electric). */
  function clean(o) {
    o = o || {};
    return {
      label: String(o.label || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 40),
      powertrain: o.powertrain === "electric" || o.powertrain === "hybrid" ? o.powertrain : "petrol",
      price: num(o.price),
      energy: num(o.energy),
      insurance: num(o.insurance),
      maintenance: num(o.maintenance),
      warrantyYears: num(o.warrantyYears),
      warrantyKm: num(o.warrantyKm),
      seats: num(o.seats),
    };
  }

  /**
   * @param {Object} o a cleaned option
   * @param {{kmPerYear?:number, fuelPrice?:number, kwhPrice?:number, years?:number}} s the person's shared assumptions
   */
  function evaluate(o, s) {
    var km = num(s.kmPerYear), years = num(s.years);
    var unitPrice = o.powertrain === "electric" ? num(s.kwhPrice) : num(s.fuelPrice);
    var energyPerYear = km && o.energy != null && unitPrice != null ? km / 100 * o.energy * unitPrice : null;
    var parts = [energyPerYear, o.insurance, o.maintenance];
    var known = parts.filter(function (x) {
      return x != null;
    });
    // running cost is only shown when every part is known; a partial sum would make an option look cheaper than it is
    var runningPerYear = known.length === parts.length
      ? known.reduce(function (a, b) {
        return a + b;
      }, 0)
      : null;
    var costOverYears = o.price != null && runningPerYear != null && years ? o.price + runningPerYear * years : null;
    return {
      energyPerYear: energyPerYear,
      runningPerYear: runningPerYear,
      costOverYears: costOverYears,
      missing: parts.length - known.length,
    };
  }

  var SPEC = [
    ["price", "low"],
    ["runningPerYear", "low"],
    ["costOverYears", "low"],
    ["warrantyYears", "high"],
    ["warrantyKm", "high"],
    ["seats", "high"],
  ];
  function value(r, key) {
    return key in r.result ? r.result[key] : r.option[key];
  }

  /** Lowest/highest per metric (ties → all of them); needs at least 2 known, different values. */
  function highlights(rows) {
    var out = {};
    SPEC.forEach(function (s) {
      var key = s[0], dir = s[1];
      var vals = rows.map(function (r) {
        return value(r, key);
      });
      var known = vals.filter(function (v) {
        return v != null;
      });
      if (known.length < 2 || Math.min.apply(null, known) === Math.max.apply(null, known)) return;
      var target = dir === "low" ? Math.min.apply(null, known) : Math.max.apply(null, known);
      out[key] = {
        dir: dir,
        idx: vals.map(function (v, i) {
          return v === target ? i : -1;
        }).filter(function (i) {
          return i >= 0;
        }),
      };
    });
    return out;
  }

  // the stated priority → the metric that measures it; reliability and performance cannot be computed from prices
  var PRIORITY_METRIC = { economy: "runningPerYear", warranty: "warrantyYears", space: "seats", budget: "costOverYears" };

  function compare(options, shared, priority) {
    var rows = (options || []).slice(0, MAX_OPTIONS).map(clean).map(function (o) {
      return { option: o, result: evaluate(o, shared || {}) };
    });
    var h = highlights(rows);
    var metric = PRIORITY_METRIC[priority] || null;
    var byPriority = metric ? { metric: metric, idx: h[metric] ? h[metric].idx : [] } : priority ? { metric: null, idx: [] } : null;
    var costed = rows.filter(function (r) {
      return r.result.costOverYears != null;
    }).sort(function (a, b) {
      return a.result.costOverYears - b.result.costOverYears;
    });
    var gap = costed.length >= 2 && costed[costed.length - 1].result.costOverYears !== costed[0].result.costOverYears
      ? {
        cheaper: costed[0].option.label,
        dearer: costed[costed.length - 1].option.label,
        gap: costed[costed.length - 1].result.costOverYears - costed[0].result.costOverYears,
      }
      : null;
    return { rows: rows, highlights: h, byPriority: byPriority, difference: gap };
  }

  root.PLHCarCompare = { MAX_OPTIONS: MAX_OPTIONS, clean: clean, compare: compare };
})(typeof globalThis !== "undefined" ? globalThis : window);
