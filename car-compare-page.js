// Car comparison page: the person's options live only in this browser (localStorage, optional). DOM is built with
// createElement/textContent only. Analytics: one anonymous TOOL event "car_compare" per visit — never the figures.
(function () {
  "use strict";
  var P = window.PLHPage, C = window.PLHCarCompare;
  var ctx = P && C ? P.start() : null;
  if (!ctx) return;
  var T = ctx.T, el = ctx.el;
  var KEY = "plh_car_compare_v1";
  var FIELDS = ["label", "price", "energy", "insurance", "maintenance", "warrantyYears", "warrantyKm", "seats"];
  var SHARED = ["kmPerYear", "fuelPrice", "kwhPrice", "years"];
  var nf = new Intl.NumberFormat(T.lang === "ar" ? "ar-AE-u-nu-latn" : "en-AE", { maximumFractionDigits: 0 });
  ctx.track("PAGE_VIEW");

  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || "null");
      if (d && Array.isArray(d.options)) {
        return { options: d.options.slice(0, C.MAX_OPTIONS).map(C.clean), shared: d.shared || {}, priority: d.priority || "" };
      }
    } catch (_) { /* private mode or corrupt: start fresh */ }
    return { options: [C.clean({}), C.clean({})], shared: {}, priority: "" };
  }
  var state = load();
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (_) { /* optional */ }
  }
  function name(o, i) {
    return o.label || T.option.replace("{n}", i + 1);
  }

  // shared assumptions
  SHARED.forEach(function (k) {
    var inp = document.getElementById("cc-" + k);
    if (state.shared[k] != null) inp.value = state.shared[k];
    inp.addEventListener("input", function () {
      state.shared[k] = inp.value.replace(/[,\s]/g, "");
      save();
      renderResults();
    });
  });
  document.querySelectorAll('input[name="cc-priority"]').forEach(function (r) {
    r.checked = r.value === (state.priority || "");
    r.addEventListener("change", function () {
      state.priority = r.value;
      save();
      renderResults();
    });
  });

  var box = document.getElementById("cc-options");
  function renderInputs() {
    box.textContent = "";
    state.options.forEach(function (o, i) {
      var card = el("fieldset", "card cmp-card");
      card.appendChild(el("legend", null, T.option.replace("{n}", i + 1)));
      var seg = el("div", "seg");
      seg.appendChild(el("span", "seg-h", T.fields.powertrain));
      ["petrol", "hybrid", "electric"].forEach(function (pt) {
        var l = el("label");
        var r = document.createElement("input");
        r.type = "radio";
        r.name = "pt-" + i;
        r.value = pt;
        r.setAttribute("data-i", String(i));
        r.setAttribute("data-k", "powertrain");
        r.checked = o.powertrain === pt;
        l.appendChild(r);
        l.appendChild(el("span", null, T.pt[pt]));
        seg.appendChild(l);
      });
      card.appendChild(seg);
      FIELDS.forEach(function (k) {
        var lab = el("label", "field");
        lab.appendChild(
          el("span", null, k === "energy" ? (o.powertrain === "electric" ? T.fields.energyEv : T.fields.energy) : T.fields[k]),
        );
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
      if (state.options.length > 2) {
        var rm = el("button", "ghost small", T.remove);
        rm.type = "button";
        rm.setAttribute("data-remove", String(i));
        card.appendChild(rm);
      }
      box.appendChild(card);
    });
    document.getElementById("cc-add").hidden = state.options.length >= C.MAX_OPTIONS;
  }
  box.addEventListener("input", function (e) {
    var t = e.target, i = Number(t.getAttribute("data-i")), k = t.getAttribute("data-k");
    if (!k || !state.options[i]) return;
    state.options[i][k] = k === "label" ? t.value.slice(0, 40) : t.value.replace(/[,\s]/g, "");
    save();
    renderResults();
  });
  box.addEventListener("change", function (e) {
    var t = e.target;
    if (t.getAttribute("data-k") !== "powertrain") return;
    state.options[Number(t.getAttribute("data-i"))].powertrain = t.value;
    save();
    renderInputs(); // the consumption label changes (litres vs kWh)
    renderResults();
  });
  box.addEventListener("click", function (e) {
    var i = e.target.getAttribute && e.target.getAttribute("data-remove");
    if (i == null) return;
    state.options.splice(Number(i), 1);
    save();
    renderInputs();
    renderResults();
  });
  document.getElementById("cc-add").addEventListener("click", function () {
    if (state.options.length >= C.MAX_OPTIONS) return;
    state.options.push(C.clean({}));
    save();
    renderInputs();
  });
  document.getElementById("cc-clear").addEventListener("click", function () {
    state = { options: [C.clean({}), C.clean({})], shared: {}, priority: "" };
    try {
      localStorage.removeItem(KEY);
    } catch (_) { /* optional */ }
    SHARED.forEach(function (k) {
      document.getElementById("cc-" + k).value = "";
    });
    document.querySelectorAll('input[name="cc-priority"]').forEach(function (r) {
      r.checked = r.value === "";
    });
    renderInputs();
    renderResults();
  });

  var out = document.getElementById("cc-out");
  var METRICS = ["price", "runningPerYear", "costOverYears", "warrantyYears", "warrantyKm", "seats"];
  function fmt(k, v) {
    if (v == null) return T.notGiven;
    if (k === "warrantyYears") return nf.format(v) + " " + T.yearsUnit;
    if (k === "warrantyKm") return nf.format(v) + " km";
    if (k === "seats") return nf.format(v);
    return T.money + " " + nf.format(v);
  }
  var tracked = false;
  function renderResults() {
    var options = state.options.map(C.clean);
    var shared = {};
    SHARED.forEach(function (k) {
      shared[k] = state.shared[k] === "" || state.shared[k] == null ? null : Number(state.shared[k]);
    });
    var r = C.compare(options, shared, state.priority || null);
    out.textContent = "";
    out.appendChild(el("h2", null, T.resultsH));
    var filled = r.rows.filter(function (x) {
      return x.option.price != null || x.option.label;
    });
    if (filled.length < 2) {
      out.appendChild(el("p", "hint", T.needTwo));
      return;
    }
    if (!tracked) {
      tracked = true;
      ctx.track("TOOL", "car_compare");
    }
    METRICS.forEach(function (k) {
      var sec = el("div", "cmp-metric");
      sec.appendChild(el("h3", null, T.metrics[k].replace("{n}", shared.years || "N")));
      var ul = el("ul");
      r.rows.forEach(function (row, i) {
        var li = el("li");
        li.appendChild(el("span", null, name(row.option, i)));
        var v = k in row.result ? row.result[k] : row.option[k];
        li.appendChild(el("b", null, fmt(k, v)));
        var h = r.highlights[k];
        if (h && h.idx.indexOf(i) >= 0) li.appendChild(el("em", "badge", h.dir === "low" ? T.lowest : T.highest));
        ul.appendChild(li);
      });
      sec.appendChild(ul);
      out.appendChild(sec);
    });
    if (
      r.rows.some(function (x) {
        return x.result.missing > 0 && (x.option.price != null);
      })
    ) out.appendChild(el("p", "note", T.partial));
    if (r.byPriority) {
      var p = el("p", "cmp-diff");
      if (!r.byPriority.metric) p.textContent = T.priorityNotComputable;
      else if (!r.byPriority.idx.length) p.textContent = T.priorityUnknown;
      else {
        p.textContent = T.priorityMatch.replace(
          "{x}",
          r.byPriority.idx.map(function (i) {
            return name(r.rows[i].option, i);
          }).join(" / "),
        ).replace("{p}", T.priorityName[state.priority]);
      }
      out.appendChild(p);
    }
    if (r.difference) {
      out.appendChild(el(
        "p",
        "cmp-diff",
        T.diff.replace("{dearer}", r.difference.dearer || T.option.replace("{n}", "?"))
          .replace("{cheaper}", r.difference.cheaper || T.option.replace("{n}", "?"))
          .replace("{gap}", T.money + " " + nf.format(r.difference.gap))
          .replace("{n}", shared.years),
      ));
    }
  }
  renderInputs();
  renderResults();
})();
