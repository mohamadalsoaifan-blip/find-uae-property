// Decision workspace: one summary of everything the person saved ON THIS DEVICE (property comparison, car needs,
// car comparison), so they can stop and continue later. Pure summary of what was stored — nothing is computed,
// fetched or sent. Shared by the page (workspace-page.js) and the tests.
(function (root) {
  "use strict";
  var KEYS = { property: "plh_compare_v1", carNeeds: "plh_car_guide_v1", cars: "plh_car_compare_v1" };
  var NEED_KEYS = ["condition", "body", "seats", "powertrain", "usage", "priority", "carBudget", "payment", "emirate", "timeline"];

  function parse(raw) {
    try {
      var d = JSON.parse(raw || "null");
      return d && typeof d === "object" ? d : null;
    } catch (_) {
      return null;
    }
  }
  function label(v) {
    return String(v == null ? "" : v).replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 40);
  }
  function num(v) {
    var n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(/[,\s]/g, ""));
    return isFinite(n) && n >= 0 ? n : null;
  }
  function options(d) {
    return (d && Array.isArray(d.options) ? d.options : []).slice(0, 4).map(function (o) {
      return { label: label(o && o.label), price: num(o && o.price) };
    }).filter(function (o) {
      return o.label || o.price != null;
    });
  }

  /** @param {(key:string)=>string|null} read  storage reader (localStorage.getItem) */
  function summary(read) {
    var p = options(parse(read(KEYS.property)));
    var c = options(parse(read(KEYS.cars)));
    var n = parse(read(KEYS.carNeeds));
    var needs = {};
    if (n) {
      NEED_KEYS.forEach(function (k) {
        if (typeof n[k] === "string" && /^[a-z0-9_]{2,20}$/.test(n[k])) needs[k] = n[k];
      });
    }
    var hasNeeds = Object.keys(needs).length > 0;
    var q = Object.keys(needs).map(function (k) {
      return k + "=" + encodeURIComponent(needs[k]);
    }).join("&");
    return {
      property: p,
      cars: c,
      carNeeds: hasNeeds ? needs : null,
      carNeedsQuery: q,
      empty: !p.length && !c.length && !hasNeeds,
    };
  }

  root.PLHWorkspace = { KEYS: KEYS, summary: summary };
})(typeof globalThis !== "undefined" ? globalThis : window);
