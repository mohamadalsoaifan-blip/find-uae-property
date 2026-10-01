// Buyer calculators page: reads the inputs, computes with site/tools.js, writes results with textContent only.
// Analytics: one anonymous TOOL event per tool per visit (which tool — never the numbers typed).
(function () {
  "use strict";
  try {
    if (window.top !== window.self) return; // never active inside someone else's frame
  } catch (_) {
    return;
  }
  var T = JSON.parse(document.getElementById("t").textContent);
  var P = window.PLHTools;
  var cfg = window.PLH_CONFIG || {};
  if (!P) return;
  var nf = new Intl.NumberFormat(T.lang === "ar" ? "ar-AE-u-nu-latn" : "en-AE", { maximumFractionDigits: 0 });
  function money(n) {
    return T.money + " " + nf.format(n);
  }
  function v(id) {
    var el = document.getElementById(id);
    return el ? el.value : "";
  }
  function row(box, label, value, strong) {
    var p = document.createElement("p");
    p.className = strong ? "res total" : "res";
    var a = document.createElement("span");
    a.textContent = label;
    var b = document.createElement("b");
    b.textContent = value;
    p.appendChild(a);
    p.appendChild(b);
    box.appendChild(p);
  }
  function clear(box) {
    box.textContent = "";
  }

  // ---------------------------------------------------------------- anonymous usage (once per tool)
  var sid = null;
  try {
    sid = sessionStorage.getItem("plh_sid");
    if (!sid) {
      sid = window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "-tools-" + Math.random().toString(16).slice(2);
      sessionStorage.setItem("plh_sid", sid);
    }
  } catch (_) { /* private mode */ }
  var used = {};
  function track(tool) {
    if (used[tool] || !cfg.api || !sid) return;
    used[tool] = true;
    var body = JSON.stringify({ event: "TOOL", detail: tool, sessionId: sid, page: location.pathname.slice(0, 150), lang: T.lang });
    var url = cfg.api + (cfg.api.indexOf("?") < 0 ? "?" : "&") + "event=1";
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(url, body)) return;
      fetch(url, { method: "POST", body: body, keepalive: true, headers: { "content-type": "text/plain" } }).catch(function () {});
    } catch (_) { /* optional */ }
  }

  // ---------------------------------------------------------------- shared fee inputs
  function mortgage() {
    var r = document.querySelector('input[name="c-fin"]:checked');
    return !!r && r.value === "mortgage";
  }
  function fees() {
    return { agencyPct: v("c-agency"), mortgageRegPct: v("c-mreg"), otherFees: v("c-other") };
  }
  var cta = document.getElementById("tools-cta");
  var ctaBase = cta ? cta.getAttribute("href").replace(/#.*$/, "") : "";
  function setBudget(price) {
    var b = P.band(price);
    if (cta && b) cta.setAttribute("href", ctaBase + "?budget=" + b + (mortgage() ? "&payment=mortgage" : "&payment=cash") + "#find");
  }

  function renderCost() {
    var box = document.getElementById("c-out");
    var r = P.upfrontCost({
      price: v("c-price"),
      mortgage: mortgage(),
      ltvPct: v("c-ltv") === "" ? null : v("c-ltv"),
      agencyPct: fees().agencyPct,
      mortgageRegPct: fees().mortgageRegPct,
      otherFees: fees().otherFees,
    });
    clear(box);
    if (!r) {
      var p = document.createElement("p");
      p.className = "hint";
      p.textContent = T.empty;
      box.appendChild(p);
      return;
    }
    if (mortgage()) row(box, T.out.loan + " (" + r.ltvPct + "%)", money(r.loan));
    ["downPayment", "dldFee", "agencyFee", "mortgageRegistration", "otherFees"].forEach(function (k) {
      if (r.parts[k] || k === "downPayment" || k === "dldFee") row(box, T.out[k], money(r.parts[k]));
    });
    row(box, T.out.total, money(r.total), true);
    setBudget(r.price);
    track("cost");
  }
  function renderAfford() {
    var box = document.getElementById("a-out");
    var pay = document.getElementById("a-pay");
    clear(box);
    clear(pay);
    var m = P.maxPriceForCash({
      cash: v("a-cash"),
      mortgage: mortgage(),
      ltvPct: v("c-ltv") === "" ? null : v("c-ltv"),
      agencyPct: fees().agencyPct,
      mortgageRegPct: fees().mortgageRegPct,
      otherFees: fees().otherFees,
    });
    if (!m) return;
    var line = mortgage() ? " — " + T.outLtv + " " + m.ltvPct + "%" : "";
    row(box, box.getAttribute("data-label"), money(m.maxPrice) + line, true);
    setBudget(m.maxPrice);
    track("afford");
    if (mortgage()) {
      var mp = P.monthlyPayment({
        loan: m.maxPrice * m.ltvPct / 100,
        ratePct: v("a-rate") === "" ? null : v("a-rate"),
        years: v("a-years"),
      });
      if (mp != null) row(pay, pay.getAttribute("data-label"), money(mp));
    }
  }
  function renderYield() {
    var box = document.getElementById("y-out");
    clear(box);
    var r = P.rentalYield({ price: v("y-price"), annualRent: v("y-rent"), annualCosts: v("y-costs") });
    if (!r) return;
    row(box, box.getAttribute("data-gross"), r.grossPct + "%");
    row(box, box.getAttribute("data-net"), r.netPct + "%", true);
    row(box, box.getAttribute("data-income"), money(r.netIncome));
    track("yield");
  }

  function all() {
    var m = document.getElementById("c-mortgage");
    if (m) m.hidden = !mortgage();
    renderCost();
    renderAfford();
    renderYield();
  }
  document.querySelector("main").addEventListener("input", all);
  document.querySelector("main").addEventListener("change", all);
  all();
})();
