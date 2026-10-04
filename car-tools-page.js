// Car calculators page: reads the person's inputs, computes with car-tools.js, writes results with textContent only.
// Analytics: one anonymous TOOL event per calculator per visit (which tool — never the numbers typed).
(function () {
  "use strict";
  var P = window.PLHPage, K = window.PLHCarTools;
  var ctx = P && K ? P.start() : null;
  if (!ctx) return;
  var T = ctx.T;
  var nf = new Intl.NumberFormat(T.lang === "ar" ? "ar-AE-u-nu-latn" : "en-AE", { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat(T.lang === "ar" ? "ar-AE-u-nu-latn" : "en-AE", { maximumFractionDigits: 2 });
  function money(n) {
    return T.money + " " + nf.format(n);
  }
  function n(id) {
    var raw = (document.getElementById(id).value || "").replace(/[,\s]/g, "");
    if (raw === "") return undefined;
    var x = Number(raw);
    return isFinite(x) ? x : undefined;
  }
  function row(box, label, value, strong) {
    var p = ctx.el("p", strong ? "res total" : "res");
    p.appendChild(ctx.el("span", null, label));
    p.appendChild(ctx.el("b", null, value));
    box.appendChild(p);
  }
  var used = {};
  function used1(tool) {
    if (used[tool]) return;
    used[tool] = true;
    ctx.track("TOOL", tool);
  }
  ctx.track("PAGE_VIEW");

  function finance() {
    var box = document.getElementById("f-out");
    box.textContent = "";
    var method = P.picked(document, "f-method") || "flat";
    var r = K.finance({ price: n("f-price"), down: n("f-down"), ratePct: n("f-rate"), months: n("f-months"), method: method });
    if (!r) return box.appendChild(ctx.el("p", "hint", T.need));
    used1("car_finance");
    var F = T.finance;
    row(box, F.financed, money(r.financed));
    row(box, F.monthly, money(r.monthly), true);
    row(box, F.interest, money(r.totalInterest));
    row(box, F.total, money(r.totalPaid));
    if (method === "flat") {
      var eq = K.flatToReducing(n("f-rate"), n("f-months"));
      if (eq !== null) box.appendChild(ctx.el("p", "note", F.equiv + " " + nf1.format(eq) + "%"));
    }
  }
  function ownership() {
    var box = document.getElementById("o-out");
    box.textContent = "";
    var r = K.ownership({
      kmPerYear: n("o-km"),
      lPer100: n("o-l100"),
      fuelPrice: n("o-fuel"),
      insurance: n("o-ins"),
      registration: n("o-reg"),
      maintenance: n("o-maint"),
      other: n("o-other"),
      price: n("o-price"),
      resale: n("o-resale"),
      years: n("o-years"),
    });
    if (!r) return box.appendChild(ctx.el("p", "hint", T.need));
    used1("car_own");
    var O = T.own;
    row(box, O.fuelYear, money(r.fuelPerYear));
    row(box, O.fixedYear, money(r.fixedPerYear));
    if (r.depreciationPerYear !== null) row(box, O.depYear, money(r.depreciationPerYear));
    row(box, O.annual, money(r.annual), true);
    row(box, O.monthly, money(r.monthly), true);
    row(box, O.perKm, T.money + " " + nf1.format(r.perKm));
  }
  function ev() {
    var box = document.getElementById("e-out");
    box.textContent = "";
    var r = K.evVsPetrol({
      kmPerYear: n("e-km"),
      petrolLPer100: n("e-pl"),
      petrolPrice: n("e-pp"),
      evKwhPer100: n("e-ek"),
      kwhPrice: n("e-kp"),
      petrolMaint: n("e-pm"),
      evMaint: n("e-em"),
      petrolCarPrice: n("e-pc"),
      evCarPrice: n("e-ec"),
    });
    if (!r) return box.appendChild(ctx.el("p", "hint", T.need));
    used1("car_ev");
    var E = T.ev;
    row(box, E.petrolYear, money(r.petrolPerYear));
    row(box, E.evYear, money(r.evPerYear));
    row(box, r.savingPerYear >= 0 ? E.saving : E.costsMore, money(Math.abs(r.savingPerYear)), true);
    if (r.pricePremium !== null) {
      box.appendChild(
        ctx.el("p", "note", r.paybackYears !== null ? E.payback + " " + nf1.format(r.paybackYears) + " " + T.years : E.noPayback),
      );
    }
  }
  document.getElementById("car-fin").addEventListener("input", finance);
  document.getElementById("car-fin").addEventListener("change", finance);
  document.getElementById("car-own").addEventListener("input", ownership);
  document.getElementById("car-ev").addEventListener("input", ev);
  finance();
  ownership();
  ev();
})();
