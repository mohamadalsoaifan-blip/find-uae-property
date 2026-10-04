// Car calculators. Pure arithmetic on the person's OWN numbers: no price, fee, insurance premium, fuel price or
// finance rate is built in, because those change and differ by car, emirate and provider. Every result returns the
// inputs it used so the page can show them as assumptions. Shared by the page (car-tools-page.js) and the tests.
(function (root) {
  "use strict";

  var num = function (v) {
    return typeof v === "number" && isFinite(v) && v >= 0 ? v : null;
  };

  /**
   * Car finance. UAE dealers and banks often quote a FLAT rate (interest on the full amount for the whole term);
   * a REDUCING rate charges interest only on what is still owed. The same headline % costs more when flat.
   * @param {{price:number, down:number, ratePct:number, months:number, method:"flat"|"reducing"}} i
   */
  function finance(i) {
    var price = num(i.price), down = num(i.down) || 0, rate = num(i.ratePct), n = num(i.months);
    if (!price || rate === null || !n || n > 120 || down >= price || rate > 50) return null;
    var principal = price - down;
    var monthly;
    if (i.method === "flat") {
      monthly = (principal + principal * (rate / 100) * (n / 12)) / n;
    } else {
      var r = rate / 100 / 12;
      monthly = r === 0 ? principal / n : principal * r / (1 - Math.pow(1 + r, -n));
    }
    var total = monthly * n;
    return {
      financed: principal,
      monthly: monthly,
      totalInterest: total - principal,
      totalPaid: total + down,
      method: i.method === "flat" ? "flat" : "reducing",
    };
  }

  /** The reducing-balance rate that gives the same monthly payment as a flat rate (bisection; for comparison only). */
  function flatToReducing(ratePct, months) {
    var f = finance({ price: 100000, down: 0, ratePct: ratePct, months: months, method: "flat" });
    if (!f) return null;
    var lo = 0, hi = 60;
    for (var k = 0; k < 60; k++) {
      var mid = (lo + hi) / 2;
      var g = finance({ price: 100000, down: 0, ratePct: mid, months: months, method: "reducing" });
      if (g.monthly > f.monthly) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  }

  /**
   * Running cost of owning one car. Fuel = km × L/100km × price per litre. Depreciation is counted only when the
   * person gives an expected resale value.
   * @param {{price?:number, years?:number, resale?:number, kmPerYear:number, lPer100:number, fuelPrice:number,
   *          insurance?:number, registration?:number, maintenance?:number, other?:number, financeInterestPerYear?:number}} i
   */
  function ownership(i) {
    var km = num(i.kmPerYear), l100 = num(i.lPer100), fuel = num(i.fuelPrice);
    if (!km || !l100 || fuel === null || l100 > 40) return null;
    var energy = km / 100 * l100 * fuel;
    var fixed = (num(i.insurance) || 0) + (num(i.registration) || 0) + (num(i.maintenance) || 0) + (num(i.other) || 0) +
      (num(i.financeInterestPerYear) || 0);
    var price = num(i.price), years = num(i.years), resale = num(i.resale);
    var depreciation = price && years && resale !== null && resale <= price ? (price - resale) / years : null;
    var annual = energy + fixed + (depreciation || 0);
    return {
      fuelPerYear: energy,
      fixedPerYear: fixed,
      depreciationPerYear: depreciation,
      annual: annual,
      monthly: annual / 12,
      perKm: annual / km,
    };
  }

  /**
   * Electric vs petrol running cost for the same yearly distance. Payback = extra purchase price ÷ yearly saving
   * (only when the EV costs more AND saves money each year).
   * @param {{kmPerYear:number, petrolLPer100:number, petrolPrice:number, evKwhPer100:number, kwhPrice:number,
   *          petrolMaint?:number, evMaint?:number, petrolCarPrice?:number, evCarPrice?:number}} i
   */
  function evVsPetrol(i) {
    var km = num(i.kmPerYear), pl = num(i.petrolLPer100), pp = num(i.petrolPrice), ek = num(i.evKwhPer100), kp = num(i.kwhPrice);
    if (!km || !pl || pp === null || !ek || kp === null || pl > 40 || ek > 60) return null;
    var petrol = km / 100 * pl * pp + (num(i.petrolMaint) || 0);
    var ev = km / 100 * ek * kp + (num(i.evMaint) || 0);
    var saving = petrol - ev;
    var premium = num(i.evCarPrice) !== null && num(i.petrolCarPrice) !== null ? i.evCarPrice - i.petrolCarPrice : null;
    var payback = premium !== null && premium > 0 && saving > 0 ? premium / saving : null;
    return { petrolPerYear: petrol, evPerYear: ev, savingPerYear: saving, pricePremium: premium, paybackYears: payback };
  }

  root.PLHCarTools = { finance: finance, flatToReducing: flatToReducing, ownership: ownership, evVsPetrol: evVsPetrol };
})(typeof globalThis !== "undefined" ? globalThis : window);
