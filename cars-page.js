// Car guide page. The explained answer is computed in the browser (cars.js) from the answers; nothing is sent until
// the person asks for help. Answers already stated in the one-sentence box arrive as URL parameters and are pre-ticked
// (never asked twice). Analytics: one anonymous TOOL event "car_guide" per visit — never the answers.
(function () {
  "use strict";
  var P = window.PLHPage, C = window.PLHCars;
  var ctx = P && C ? P.start() : null;
  if (!ctx) return;
  var T = ctx.T, el = ctx.el;
  var KEYS = ["condition", "body", "seats", "powertrain", "usage", "priority", "carBudget", "payment", "emirate", "timeline"];
  var form = document.getElementById("car");
  var out = document.getElementById("car-out");
  ctx.track("PAGE_VIEW");

  // pre-fill from the one-sentence box (only values that exist as options)
  var filled = 0;
  KEYS.forEach(function (k) {
    var v = ctx.params.get(k);
    if (!v || !/^[a-z0-9_]{2,20}$/.test(v)) return;
    var input = form.querySelector('input[name="c-' + k + '"][value="' + v + '"]');
    if (input) {
      input.checked = true;
      filled++;
    }
  });
  if (!filled) {
    try {
      var saved = JSON.parse(localStorage.getItem("plh_car_guide_v1") || "null") || {};
      KEYS.forEach(function (k) {
        var v = saved[k];
        if (typeof v !== "string" || !/^[a-z0-9_]{2,20}$/.test(v)) return;
        var input = form.querySelector('input[name="c-' + k + '"][value="' + v + '"]');
        if (input) input.checked = true;
      });
    } catch (_) { /* nothing saved */ }
  }
  if (filled) {
    // came from the one-sentence box: show the explained answer first, the questions below to refine it
    document.getElementById("car-prefilled").hidden = false;
    form.parentNode.insertBefore(out, form);
  }

  function answers() {
    var a = {};
    KEYS.forEach(function (k) {
      a[k] = P.picked(form, "c-" + k);
    });
    var d = document.getElementById("c-description").value.replace(/\s+/g, " ").trim();
    a.description = d ? d.slice(0, 120) : null;
    return a;
  }

  // remember the answers on this device so the workspace can resume them (never sent anywhere)
  function remember(a) {
    var keep = {};
    KEYS.forEach(function (k) {
      if (a[k]) keep[k] = a[k];
    });
    try {
      localStorage.setItem("plh_car_guide_v1", JSON.stringify(keep));
    } catch (_) { /* private mode */ }
  }
  var tracked = false;
  function render() {
    var a = answers();
    remember(a);
    out.textContent = "";
    out.appendChild(el("h2", null, T.resultsH));
    if (!a.seats && !a.usage && (!a.body || a.body === "not_sure")) {
      out.appendChild(el("p", "hint", T.need));
      return;
    }
    if (!tracked) {
      tracked = true;
      ctx.track("TOOL", "car_guide");
    }
    var r = C.advise(a);
    r.fit.forEach(function (x) {
      var card = el("div", "res fit");
      card.setAttribute("data-fit", x.id);
      card.appendChild(el("h3", null, T.fit[x.id]));
      var ul = el("ul");
      x.why.forEach(function (k) {
        ul.appendChild(el("li", null, T.why[k]));
      });
      card.appendChild(ul);
      out.appendChild(card);
    });
    if (r.warn.length) {
      var w = el("div", "warn");
      w.appendChild(el("h3", null, T.warnH));
      var wl = el("ul");
      r.warn.forEach(function (k) {
        wl.appendChild(el("li", null, T.warn[k]));
      });
      w.appendChild(wl);
      out.appendChild(w);
    }
    out.appendChild(el("h3", null, T.checksH));
    var ol = el("ol", "checks");
    ol.id = "car-checks";
    r.checks.forEach(function (k) {
      ol.appendChild(el("li", null, T.checks[k]));
    });
    out.appendChild(ol);
    if (r.missing.length) {
      out.appendChild(el(
        "p",
        "note",
        T.missingH + " " + r.missing.map(function (k) {
          return T.qName[k];
        }).join(" · "),
      ));
    }
  }
  form.addEventListener("change", render);
  render();

  P.bindRequest(ctx, "cars", function () {
    var a = answers();
    return KEYS.some(function (k) {
        return !a[k];
      })
      ? null
      : a;
  });
})();
