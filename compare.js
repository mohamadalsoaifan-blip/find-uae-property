// Decision workspace: compare up to 4 properties the BUYER found anywhere (portal, developer, agent) using the numbers
// they type. We hold no listings, so we never show, price or rank properties ourselves; we compute what each option
// really costs and returns, from the buyer's figures + the published rules in site/tools.js, and point out
// differences. No option is called "best": each metric names its own lowest/highest. Shared by the page and tests.
(function (root) {
  "use strict";
  var MAX_OPTIONS = 4;

  function num(v) {
    var n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(/[,\s]/g, ""));
    return isFinite(n) && n >= 0 ? n : null;
  }
  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  /** Clean one option exactly as typed: unknown stays null (never filled in). */
  function clean(o) {
    o = o || {};
    var label = String(o.label || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 40);
    return {
      label: label,
      price: num(o.price),
      sizeSqft: num(o.sizeSqft),
      bedrooms: num(o.bedrooms),
      status: o.status === "offplan" || o.status === "ready" ? o.status : null,
      serviceChargePerSqft: num(o.serviceChargePerSqft),
      annualRent: num(o.annualRent),
    };
  }

  /**
   * @param {Object} o one cleaned option
   * @param {{mortgage:boolean, ltvPct?:number, agencyPct?:number, mortgageRegPct?:number, otherFees?:number}} f
   */
  function evaluate(o, f, tools) {
    if (!o.price) return null;
    var cost = tools.upfrontCost({
      price: o.price,
      mortgage: !!f.mortgage,
      ltvPct: f.ltvPct,
      agencyPct: f.agencyPct,
      mortgageRegPct: f.mortgageRegPct,
      otherFees: f.otherFees,
    });
    var serviceCharges = o.serviceChargePerSqft != null && o.sizeSqft ? Math.round(o.serviceChargePerSqft * o.sizeSqft) : null;
    var y = o.annualRent ? tools.rentalYield({ price: o.price, annualRent: o.annualRent, annualCosts: serviceCharges || 0 }) : null;
    return {
      upfront: cost.total,
      loan: cost.loan,
      pricePerSqft: o.sizeSqft ? Math.round(o.price / o.sizeSqft) : null,
      serviceCharges: serviceCharges,
      grossYieldPct: y ? y.grossPct : null,
      // net yield is only shown when the service charge is known; otherwise it would silently overstate the return
      netYieldPct: y && serviceCharges != null ? y.netPct : null,
    };
  }

  /** Which option is lowest/highest on each metric (ties → all of them); needs at least 2 known values. */
  function highlights(rows) {
    var spec = [
      ["price", "low"],
      ["upfront", "low"],
      ["pricePerSqft", "low"],
      ["serviceCharges", "low"],
      ["grossYieldPct", "high"],
      ["netYieldPct", "high"],
    ];
    var out = {};
    spec.forEach(function (s) {
      var key = s[0], dir = s[1];
      var vals = rows.map(function (r) {
        return r && (key === "price" ? r.option.price : r.result[key]);
      });
      var known = vals.filter(function (v) {
        return v != null;
      });
      if (known.length < 2) return;
      var target = dir === "low" ? Math.min.apply(null, known) : Math.max.apply(null, known);
      if (Math.min.apply(null, known) === Math.max.apply(null, known)) return; // all equal: nothing to point out
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

  /** Plain-language differences between the cheapest and the most expensive option (facts only). */
  function differences(rows) {
    var priced = rows.filter(function (r) {
      return r && r.option.price;
    });
    if (priced.length < 2) return null;
    priced.sort(function (a, b) {
      return a.option.price - b.option.price;
    });
    var lo = priced[0], hi = priced[priced.length - 1];
    if (lo.option.price === hi.option.price) return null;
    return {
      cheaper: lo.option.label,
      dearer: hi.option.label,
      priceGap: hi.option.price - lo.option.price,
      upfrontGap: hi.result.upfront - lo.result.upfront,
    };
  }

  // ---------------------------------------------------------------- fit with the buyer's own needs
  // A published, fixed rule — not a recommendation: each criterion counts only when the buyer gave the need AND the
  // option has the value; the score is the share of those criteria met. No market data, no yield judgement (that
  // would be investment advice), and nothing about commissions.
  var FIT_WEIGHTS = { budget: 35, cash: 35, bedrooms: 20, status: 10 };
  var BUDGET_TOLERANCE = 0.1; // up to 10% over the stated budget earns half the budget points, with the gap shown

  function cleanNeeds(n) {
    n = n || {};
    return {
      maxBudget: num(n.maxBudget),
      cash: num(n.cash),
      minBedrooms: num(n.minBedrooms),
      status: n.status === "ready" || n.status === "offplan" ? n.status : null,
    };
  }

  /** @returns {{score:number, basis:number, reasons:{k:string, s:"ok"|"part"|"no"|"unknown", gap?:number}[]}|null} */
  function fit(row, needs) {
    if (!row) return null;
    var n = cleanNeeds(needs), o = row.option, r = row.result;
    var earned = 0, possible = 0, reasons = [];
    function add(k, s, gap) {
      var w = FIT_WEIGHTS[k];
      if (s === "unknown") {
        reasons.push({ k: k, s: s });
        return;
      }
      possible += w;
      earned += s === "ok" ? w : s === "part" ? w / 2 : 0;
      reasons.push(gap != null ? { k: k, s: s, gap: gap } : { k: k, s: s });
    }
    if (n.maxBudget) {
      if (o.price <= n.maxBudget) add("budget", "ok");
      else add("budget", o.price <= n.maxBudget * (1 + BUDGET_TOLERANCE) ? "part" : "no", o.price - n.maxBudget);
    }
    if (n.cash) add("cash", r.upfront <= n.cash ? "ok" : "no", r.upfront <= n.cash ? undefined : r.upfront - n.cash);
    if (n.minBedrooms != null) add("bedrooms", o.bedrooms == null ? "unknown" : o.bedrooms >= n.minBedrooms ? "ok" : "no");
    if (n.status) add("status", o.status == null ? "unknown" : o.status === n.status ? "ok" : "no");
    if (!possible) return null;
    return {
      score: Math.round((100 * earned) / possible),
      basis: reasons.filter(function (x) {
        return x.s !== "unknown";
      }).length,
      reasons: reasons,
    };
  }

  function compare(options, financing, tools, needs) {
    var list = (options || []).slice(0, MAX_OPTIONS).map(clean);
    var rows = list.map(function (o) {
      var r = evaluate(o, financing || {}, tools);
      return r ? { option: o, result: r } : null;
    });
    rows.forEach(function (row) {
      if (row) row.fit = fit(row, needs);
    });
    return { rows: rows, highlights: highlights(rows), differences: differences(rows) };
  }

  root.PLHCompare = {
    MAX_OPTIONS: MAX_OPTIONS,
    FIT_WEIGHTS: FIT_WEIGHTS,
    clean: clean,
    cleanNeeds: cleanNeeds,
    fit: fit,
    compare: compare,
    round1: round1,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
