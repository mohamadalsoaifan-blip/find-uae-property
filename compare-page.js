// Decision workspace page: the buyer's options live only in this browser (localStorage, optional). DOM is built with
// createElement/textContent only. Analytics: one anonymous TOOL event "compare" per visit — never the figures.
(function () {
  "use strict";
  try {
    if (window.top !== window.self) return;
  } catch (_) {
    return;
  }
  var T = JSON.parse(document.getElementById("t").textContent);
  var C = window.PLHCompare, P = window.PLHTools, cfg = window.PLH_CONFIG || {};
  if (!C || !P) return;
  var KEY = "plh_compare_v1";
  var FIELDS = ["label", "price", "sizeSqft", "bedrooms", "serviceChargePerSqft", "annualRent"];
  var nf = new Intl.NumberFormat(T.lang === "ar" ? "ar-AE-u-nu-latn" : "en-AE", { maximumFractionDigits: 0 });

  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || "null");
      if (d && Array.isArray(d.options)) {
        return { options: d.options.slice(0, C.MAX_OPTIONS).map(C.clean), mortgage: !!d.mortgage, agencyPct: d.agencyPct || "" };
      }
    } catch (_) { /* private mode or corrupt: start fresh */ }
    return { options: [C.clean({}), C.clean({})], mortgage: false, agencyPct: "" };
  }
  var state = load();
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (_) { /* optional */ }
  }

  var tracked = false;
  function track() {
    if (tracked || !cfg.api) return;
    tracked = true;
    var sid = null;
    try {
      sid = sessionStorage.getItem("plh_sid");
      if (!sid) {
        sid = window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "-cmp-" + Math.random().toString(16).slice(2);
        sessionStorage.setItem("plh_sid", sid);
      }
    } catch (_) {
      return;
    }
    var body = JSON.stringify({ event: "TOOL", detail: "compare", sessionId: sid, page: location.pathname.slice(0, 150), lang: T.lang });
    var url = cfg.api + (cfg.api.indexOf("?") < 0 ? "?" : "&") + "event=1";
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(url, body)) return;
      fetch(url, { method: "POST", body: body, keepalive: true, headers: { "content-type": "text/plain" } }).catch(function () {});
    } catch (_) { /* optional */ }
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function name(o, i) {
    return o.label || T.option.replace("{n}", i + 1);
  }

  // ---------------------------------------------------------------- inputs
  var box = document.getElementById("cmp-options");
  function renderInputs() {
    box.textContent = "";
    state.options.forEach(function (o, i) {
      var card = el("fieldset", "card cmp-card");
      card.appendChild(el("legend", null, T.option.replace("{n}", i + 1)));
      FIELDS.forEach(function (k) {
        var lab = el("label", "field");
        lab.appendChild(el("span", null, T.fields[k]));
        var inp = document.createElement("input");
        inp.setAttribute("data-i", String(i));
        inp.setAttribute("data-k", k);
        inp.autocomplete = "off";
        if (k === "label") {
          inp.maxLength = 40;
          inp.placeholder = T.labelHint;
        } else {
          inp.inputMode = "decimal";
          inp.dir = "ltr";
        }
        inp.value = o[k] == null ? "" : String(o[k]);
        lab.appendChild(inp);
        card.appendChild(lab);
      });
      var seg = el("div", "seg");
      seg.appendChild(el("span", "seg-h", T.fields.status));
      [["ready", T.ready], ["offplan", T.offplan], ["", T.unknown]].forEach(function (s) {
        var l = el("label");
        var r = document.createElement("input");
        r.type = "radio";
        r.name = "st-" + i;
        r.value = s[0];
        r.setAttribute("data-i", String(i));
        r.setAttribute("data-k", "status");
        r.checked = (o.status || "") === s[0];
        l.appendChild(r);
        l.appendChild(el("span", null, s[1]));
        seg.appendChild(l);
      });
      card.appendChild(seg);
      if (state.options.length > 2) {
        var rm = el("button", "ghost small", T.remove);
        rm.type = "button";
        rm.setAttribute("data-remove", String(i));
        card.appendChild(rm);
      }
      box.appendChild(card);
    });
    document.getElementById("cmp-add").hidden = state.options.length >= C.MAX_OPTIONS;
  }

  // ---------------------------------------------------------------- results
  var out = document.getElementById("cmp-out");
  var METRICS = ["price", "upfront", "pricePerSqft", "serviceCharges", "grossYieldPct", "netYieldPct"];
  function fmt(k, v) {
    if (v == null) return T.notGiven;
    return /YieldPct$/.test(k) ? v + "%" : T.money + " " + nf.format(v);
  }
  var cta = document.getElementById("cmp-cta");
  var ctaBase = cta ? cta.getAttribute("href").replace(/#.*$/, "") : "";
  function renderResults() {
    out.textContent = "";
    var r = C.compare(state.options, { mortgage: state.mortgage, agencyPct: state.agencyPct }, P);
    var rows = r.rows;
    var priced = rows.filter(Boolean);
    if (priced.length < 2) {
      out.appendChild(el("p", "hint", T.needTwo));
      return;
    }
    track();
    METRICS.forEach(function (k) {
      var block = el("div", "cmp-metric");
      block.appendChild(el("h3", null, T.metrics[k]));
      var hl = r.highlights[k];
      var ul = el("ul");
      rows.forEach(function (row, i) {
        if (!row) return;
        var v = k === "price" ? row.option.price : row.result[k];
        var li = el("li");
        li.appendChild(el("span", null, name(row.option, i)));
        var b = el("b", null, fmt(k, v));
        li.appendChild(b);
        if (hl && hl.idx.indexOf(i) >= 0) li.appendChild(el("em", "badge", hl.dir === "low" ? T.lowest : T.highest));
        ul.appendChild(li);
      });
      block.appendChild(ul);
      out.appendChild(block);
    });
    if (r.differences) {
      out.appendChild(el(
        "p",
        "cmp-diff",
        T.diff
          .replace("{dearer}", r.differences.dearer || T.option.replace("{n}", "?"))
          .replace("{cheaper}", r.differences.cheaper || T.option.replace("{n}", "?"))
          .replace("{gap}", T.money + " " + nf.format(r.differences.priceGap))
          .replace("{upfront}", T.money + " " + nf.format(Math.abs(r.differences.upfrontGap))),
      ));
    }
    // the budget band of the options carries over to the buyer form; the options themselves never leave the device
    var prices = priced.map(function (x) {
      return x.option.price;
    }).sort(function (a, b) {
      return a - b;
    });
    var band = P.band(prices[Math.floor((prices.length - 1) / 2)]);
    if (cta && band) cta.setAttribute("href", ctaBase + "?budget=" + band + "&payment=" + (state.mortgage ? "mortgage" : "cash") + "#find");
  }

  // ---------------------------------------------------------------- events
  box.addEventListener("input", function (e) {
    var t = e.target, i = Number(t.getAttribute("data-i")), k = t.getAttribute("data-k");
    if (!k || !state.options[i]) return;
    var o = Object.assign({}, state.options[i]);
    o[k] = t.value;
    state.options[i] = C.clean(o);
    save();
    renderResults();
  });
  box.addEventListener("change", function (e) {
    var t = e.target;
    if (t.getAttribute("data-k") === "status") {
      state.options[Number(t.getAttribute("data-i"))].status = t.value || null;
      save();
    }
  });
  box.addEventListener("click", function (e) {
    var i = e.target.getAttribute && e.target.getAttribute("data-remove");
    if (i == null) return;
    state.options.splice(Number(i), 1);
    save();
    renderInputs();
    renderResults();
  });
  document.getElementById("cmp-add").addEventListener("click", function () {
    if (state.options.length >= C.MAX_OPTIONS) return;
    state.options.push(C.clean({}));
    save();
    renderInputs();
    var last = box.querySelectorAll("input[data-k=price]");
    if (last.length) last[last.length - 1].focus();
  });
  document.getElementById("cmp-clear").addEventListener("click", function () {
    state = { options: [C.clean({}), C.clean({})], mortgage: state.mortgage, agencyPct: state.agencyPct };
    save();
    renderInputs();
    renderResults();
  });
  Array.prototype.forEach.call(document.querySelectorAll("input[name=cmp-fin]"), function (r) {
    r.checked = (r.value === "mortgage") === state.mortgage;
    r.addEventListener("change", function () {
      state.mortgage = r.value === "mortgage" && r.checked;
      save();
      renderResults();
    });
  });
  var ag = document.getElementById("cmp-agency");
  ag.value = state.agencyPct;
  ag.addEventListener("input", function () {
    state.agencyPct = ag.value;
    save();
    renderResults();
  });

  renderInputs();
  renderResults();
})();
