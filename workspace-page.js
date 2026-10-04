// Decision workspace page: shows what this browser saved (workspace.js) and lets the person continue or erase it.
// DOM built with createElement/textContent only. Nothing is sent; one anonymous PAGE_VIEW event.
(function () {
  "use strict";
  var P = window.PLHPage, W = window.PLHWorkspace;
  var ctx = P && W ? P.start() : null;
  if (!ctx) return;
  var T = ctx.T, el = ctx.el;
  ctx.track("PAGE_VIEW");
  var nf = new Intl.NumberFormat(T.lang === "ar" ? "ar-AE-u-nu-latn" : "en-AE", { maximumFractionDigits: 0 });
  function read(k) {
    try {
      return localStorage.getItem(k);
    } catch (_) {
      return null;
    }
  }
  var box = document.getElementById("ws-out");

  function list(items) {
    var ul = el("ul", "ws-list");
    items.forEach(function (o, i) {
      var li = el("li");
      li.appendChild(el("span", null, o.label || T.option.replace("{n}", i + 1)));
      li.appendChild(el("b", null, o.price != null ? T.money + " " + nf.format(o.price) : T.noPrice));
      ul.appendChild(li);
    });
    return ul;
  }
  function section(title, bodyFn, href, cta, emptyText) {
    var s = el("section", "card ws-card");
    s.appendChild(el("h2", null, title));
    var filled = bodyFn(s);
    if (!filled) s.appendChild(el("p", "hint", emptyText));
    var a = el("a", filled ? "cta" : "cta secondary", filled ? cta : T.start);
    a.href = href;
    s.appendChild(a);
    box.appendChild(s);
  }

  function render() {
    var s = W.summary(read);
    box.textContent = "";
    if (s.empty) box.appendChild(el("p", "note ws-empty", T.empty));
    section(
      T.propertyH,
      function (sec) {
        if (!s.property.length) return false;
        sec.appendChild(el("p", "hint", T.propertyCount.replace("{n}", s.property.length)));
        sec.appendChild(list(s.property));
        return true;
      },
      T.links.compare,
      T.continueCompare,
      T.propertyEmpty,
    );
    if (T.links.cars) {
      section(
        T.carsH,
        function (sec) {
          var any = false;
          if (s.carNeeds) {
            any = true;
            var chips = el("ul", "ex-chips");
            Object.keys(s.carNeeds).forEach(function (k) {
              var lab = T.need[k] && T.need[k][s.carNeeds[k]];
              if (lab) chips.appendChild(el("li", null, lab));
            });
            sec.appendChild(el("h3", null, T.carNeedsH));
            sec.appendChild(chips);
            var g = el("a", null, T.continueGuide);
            g.href = T.links.cars + (s.carNeedsQuery ? "?" + s.carNeedsQuery : "");
            sec.appendChild(el("p")).appendChild(g);
          }
          if (s.cars.length) {
            any = true;
            sec.appendChild(el("h3", null, T.carsCompared.replace("{n}", s.cars.length)));
            sec.appendChild(list(s.cars));
          }
          return any;
        },
        T.links.carCompare,
        T.continueCarCompare,
        T.carsEmpty,
      );
    }
  }
  document.getElementById("ws-clear").addEventListener("click", function () {
    if (!window.confirm(T.confirmClear)) return;
    try {
      [W.KEYS.property, W.KEYS.cars, W.KEYS.carNeeds, "plh_answers"].forEach(function (k) {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
      });
    } catch (_) { /* optional */ }
    render();
  });
  render();
})();
