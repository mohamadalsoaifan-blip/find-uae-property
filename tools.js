// Buyer tools: pure arithmetic on the buyer's own numbers plus a few PUBLISHED rules (each with its source). Nothing
// here predicts prices, rents or returns. Shared by tools pages (browser) and unit tests (Deno).
(function (root) {
  "use strict";

  // Published rules used as DEFAULTS (always editable on the page). Re-verify at the source before changing.
  var RULES = {
    // Dubai Land Department: buyer pays 4% of the property value on registration of a sale
    dldFeePct: { value: 4, source: "https://dubailand.gov.ae/en/eservices/property-sale-registration/", checked: "2026-10-01" },
    // UAE Central Bank mortgage regulations (as amended 2020): max loan-to-value, expatriate, first home
    ltvExpatFirstHome: {
      upTo5m: 80,
      above5m: 70,
      source: "https://rulebook.centralbank.ae/en/rulebook/article-3-important-ratios",
      checked: "2026-10-01",
    },
  };

  function num(v) {
    var n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(/[,\s]/g, ""));
    return isFinite(n) ? n : null;
  }
  function round(n) {
    return Math.round(n);
  }
  function defaultLtv(price) {
    return price > 5e6 ? RULES.ltvExpatFirstHome.above5m : RULES.ltvExpatFirstHome.upTo5m;
  }

  /**
   * Cash needed upfront to buy at `price`.
   * @param {{price:number, mortgage:boolean, ltvPct?:number, dldPct?:number, agencyPct?:number,
   *          mortgageRegPct?:number, otherFees?:number}} i  percentages as numbers (4 = 4%)
   */
  function upfrontCost(i) {
    var price = num(i.price);
    if (!price || price <= 0) return null;
    var ltv = i.mortgage ? Math.min(Math.max(num(i.ltvPct) == null ? defaultLtv(price) : num(i.ltvPct), 0), 100) : 0;
    var loan = price * ltv / 100;
    var parts = {
      downPayment: price - loan,
      dldFee: price * (num(i.dldPct) == null ? RULES.dldFeePct.value : num(i.dldPct)) / 100,
      agencyFee: price * (num(i.agencyPct) || 0) / 100,
      mortgageRegistration: loan * (num(i.mortgageRegPct) || 0) / 100,
      otherFees: Math.max(num(i.otherFees) || 0, 0),
    };
    var total = 0;
    for (var k in parts) {
      parts[k] = round(parts[k]);
      total += parts[k];
    }
    return { price: round(price), loan: round(loan), ltvPct: ltv, parts: parts, total: total };
  }

  /** Highest price the buyer's cash covers (down payment + percentage fees + fixed fees). */
  function maxPriceForCash(i) {
    var cash = num(i.cash);
    if (!cash || cash <= 0) return null;
    var fees = ((num(i.dldPct) == null ? RULES.dldFeePct.value : num(i.dldPct)) + (num(i.agencyPct) || 0)) / 100;
    var other = Math.max(num(i.otherFees) || 0, 0);
    var solve = function (ltv) {
      var share = (1 - ltv / 100) + fees + (i.mortgage ? (ltv / 100) * ((num(i.mortgageRegPct) || 0) / 100) : 0);
      return share > 0 ? (cash - other) / share : 0;
    };
    if (!i.mortgage) return { maxPrice: Math.max(round(solve(0)), 0), ltvPct: 0 };
    if (num(i.ltvPct) != null) return { maxPrice: Math.max(round(solve(num(i.ltvPct))), 0), ltvPct: num(i.ltvPct) };
    // the legal cap depends on the price itself (80% up to AED 5M, 70% above)
    var hi = RULES.ltvExpatFirstHome.upTo5m, lo = RULES.ltvExpatFirstHome.above5m;
    var p80 = solve(hi);
    if (p80 <= 5e6) return { maxPrice: Math.max(round(p80), 0), ltvPct: hi };
    var p70 = solve(lo);
    if (p70 > 5e6) return { maxPrice: round(p70), ltvPct: lo };
    return { maxPrice: 5e6, ltvPct: hi }; // enough cash for AED 5M at 80%, not enough for more at 70%
  }

  /** Standard annuity payment for the rate and term the BUYER enters (no rate is assumed). */
  function monthlyPayment(i) {
    var loan = num(i.loan), rate = num(i.ratePct), years = num(i.years);
    if (!loan || loan <= 0 || rate == null || rate < 0 || !years || years <= 0) return null;
    var n = years * 12, r = rate / 100 / 12;
    return round(r === 0 ? loan / n : loan * r / (1 - Math.pow(1 + r, -n)));
  }

  /** Yield from a rent the buyer has SEEN (ideally a signed lease) and their own cost estimate. */
  function rentalYield(i) {
    var price = num(i.price), rent = num(i.annualRent), costs = Math.max(num(i.annualCosts) || 0, 0);
    if (!price || price <= 0 || !rent || rent <= 0) return null;
    var cashIn = num(i.totalCashIn);
    return {
      grossPct: Math.round((rent / price) * 1000) / 10,
      netPct: Math.round(((rent - costs) / price) * 1000) / 10,
      netIncome: round(rent - costs),
      cashOnCashPct: cashIn && cashIn > 0 ? Math.round(((rent - costs - (num(i.annualMortgagePayments) || 0)) / cashIn) * 1000) / 10 : null,
    };
  }

  /** Form budget band for a price (same bands as the buyer form). */
  function band(price) {
    var p = num(price);
    if (!p) return null;
    return p < 1e6 ? "lt1m" : p < 2e6 ? "1to2m" : p < 5e6 ? "2to5m" : p < 1e7 ? "5to10m" : "10mplus";
  }

  root.PLHTools = {
    RULES: RULES,
    upfrontCost: upfrontCost,
    maxPriceForCash: maxPriceForCash,
    monthlyPayment: monthlyPayment,
    rentalYield: rentalYield,
    band: band,
    defaultLtv: defaultLtv,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
