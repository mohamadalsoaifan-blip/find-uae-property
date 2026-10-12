// Public car ads (/listings/ search, /listing/?id= one ad). Everything comes from the listings API: only ads a person
// approved, only while CAR_LISTINGS_PUBLIC is on (otherwise the API answers open: false / 404 and the page says so).
// Enquiries go to the one CRM; nothing about the buyer reaches the seller unless they tick the second box.
// DOM is built with createElement/textContent only; photo links are short-lived signed URLs from the API.
(function () {
  "use strict";
  try {
    if (window.top !== window.self) return; // framed copies never activate
  } catch (_) {
    return;
  }
  var T = JSON.parse(document.getElementById("t").textContent);
  var API = T.listingsApi;
  var $ = function (id) {
    return document.getElementById(id);
  };
  var status = $("ls-status");
  var nf = new Intl.NumberFormat(T.lang === "ar" ? "ar-AE-u-nu-latn" : "en-AE", { maximumFractionDigits: 0 });
  var money = function (n) {
    return (T.lang === "ar" ? "درهم " : "AED ") + nf.format(n);
  };
  var day = function (iso) {
    return iso ? String(iso).slice(0, 10) : "—";
  };
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function say(text) {
    status.textContent = text || "";
    status.hidden = !text;
  }
  function get(path) {
    return fetch(API + path).then(function (res) {
      return res.json().catch(function () {
        return {};
      }).then(function (j) {
        return { status: res.status, body: j };
      });
    });
  }
  function post(path, body) {
    return fetch(API + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(function (res) {
        return res.json().catch(function () {
          return {};
        }).then(function (j) {
          return { status: res.status, body: j };
        });
      });
  }
  function img(src, cls) {
    var i = el("img", cls);
    i.src = src;
    i.alt = "";
    i.loading = "lazy";
    i.decoding = "async";
    return i;
  }
  var ID = /^[0-9a-f-]{36}$/;

  // ------------------------------------------------------------------ fit with the buyer's saved needs (this device)
  var F = window.PLHListingFit;
  function readLS(k) {
    try {
      return localStorage.getItem(k);
    } catch (_) {
      return null;
    }
  }
  function writeLS(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch (_) { /* private mode */ }
  }
  var needs = F ? F.savedNeeds(readLS) : null;
  function fitChip(ad) {
    if (!needs) return null;
    var f = F.fit(ad, needs);
    if (!f.known) return null;
    var c = el("p", "ls-fit " + (f.met === f.known ? "ls-fit-all" : f.met === 0 ? "ls-fit-none" : ""));
    c.textContent = T.fit.summary.replace("{met}", f.met).replace("{known}", f.known);
    return c;
  }

  // ------------------------------------------------------------------ search
  var FILTERS = [
    "make",
    "model",
    "emirate",
    "minPrice",
    "maxPrice",
    "minYear",
    "maxYear",
    "maxMileage",
    "fuel",
    "transmission",
    "condition",
    "regionalSpecs",
    "sort",
  ];
  var MORE = ["minPrice", "minYear", "maxYear", "maxMileage", "fuel", "transmission", "condition", "regionalSpecs"];
  var nextOffset = null;
  function query(offset) {
    var q = new URLSearchParams({ vertical: "cars" });
    FILTERS.forEach(function (k) {
      var v = $("f-" + k).value.trim();
      if (v && !(k === "sort" && v === "newest")) q.set(k, v);
    });
    var shareable = q.toString().replace(/^vertical=cars&?/, "");
    if (offset) q.set("offset", String(offset));
    return { api: q.toString(), page: shareable };
  }
  function card(r) {
    var a = el("a", "ls-card");
    a.href = T.links.listing + "?id=" + r.id;
    if (r.cover && r.cover.url) a.appendChild(img(r.cover.url, "ls-cover"));
    a.appendChild(el("h2", null, r.title));
    a.appendChild(el("p", "ls-price", money(r.priceAed)));
    var meta = [T.opt.emirate[r.emirate] || r.emirate];
    if (r.mileageKm != null) meta.push(nf.format(r.mileageKm) + " " + T.card.km);
    if (r.transmission) meta.push(T.opt.transmission[r.transmission] || r.transmission);
    if (r.fuel && r.fuel !== "petrol") meta.push(T.opt.fuel[r.fuel] || r.fuel);
    a.appendChild(el("p", "hint", meta.join(" · ")));
    var chip = fitChip(r);
    if (chip) a.appendChild(chip);
    return a;
  }
  var searchSeq = 0; // only the newest search may draw: a slower, older answer is dropped
  function search(more) {
    var mine = more ? searchSeq : ++searchSeq;
    var q = query(more ? nextOffset : 0);
    if (!more) history.replaceState(null, "", location.pathname + (q.page ? "?" + q.page : ""));
    say(more ? "" : T.loading);
    var box = $("ls-results"), load = $("ls-load");
    load.disabled = true;
    get("/public/listings?" + q.api).then(function (x) {
      if (mine !== searchSeq) return;
      load.disabled = false;
      if (!more) box.textContent = "";
      if (x.status !== 200 || !x.body.open) {
        $("ls-filters").hidden = true;
        load.hidden = true;
        return say(T.closed);
      }
      var list = x.body.results || [];
      say(x.body.total ? T.filters.count.replace("{n}", nf.format(x.body.total)) : T.empty);
      list.forEach(function (r) {
        if (ID.test(r.id)) box.appendChild(card(r));
      });
      nextOffset = x.body.nextOffset;
      load.hidden = nextOffset == null;
    }, function () {
      if (mine !== searchSeq) return;
      load.disabled = false;
      say(T.fail);
    });
  }

  // ------------------------------------------------------------------ one ad
  function detail() {
    var id = new URLSearchParams(location.search).get("id") || "";
    if (!ID.test(id)) return say(T.notFound);
    get("/public/listings/" + id).then(function (x) {
      if (x.status === 503) return say(T.closed);
      if (x.status !== 200 || !x.body.listing) return say(T.notFound);
      var l = x.body.listing, car = l.car || {};
      say("");
      document.title = l.title + " — " + document.title;
      var ad = $("ls-ad");
      ad.hidden = false;
      var badges = el("p", "hint", T.detail.sellerAd + " · " + T.detail.reviewed);
      ad.appendChild(badges);
      ad.appendChild(el("h1", null, l.title));
      ad.appendChild(el("p", "ls-price", money(l.priceAed)));
      if (l.priceDrop && l.priceDrop.fromAed > l.priceAed) {
        var dropEl = el("p", "ls-drop", T.price.drop.replace("{from}", money(l.priceDrop.fromAed)));
        ad.appendChild(dropEl);
      }
      if (l.priceContext) {
        var pc = l.priceContext, box = el("div", "ls-pricepos ls-pos-" + pc.position);
        box.appendChild(el("p", null, T.price[pc.position].replace("{pct}", Math.abs(pc.diffPct))));
        box.appendChild(el("p", "hint", T.price.basis.replace("{n}", pc.similar).replace("{median}", money(pc.medianAed))));
        ad.appendChild(box);
      }
      if (!l.available) ad.appendChild(el("p", "error", T.detail.noLongerAvailable));
      if (l.media && l.media.length) {
        var g = el("div", "ls-gallery");
        l.media.forEach(function (m) {
          if (m.url) g.appendChild(img(m.url, "ls-photo"));
        });
        ad.appendChild(g);
      }
      ad.appendChild(el("h2", null, T.detail.specs));
      var dl = el("dl", "ls-specs");
      function row(k, v) {
        if (v == null || v === "" || v === "unknown") return;
        dl.appendChild(el("dt", null, T.spec[k]));
        dl.appendChild(el("dd", null, String(v)));
      }
      row("year", car.year);
      row("mileageKm", car.mileageKm != null ? nf.format(car.mileageKm) + " " + T.card.km : null);
      row("fuel", T.opt.fuel[car.fuel] || car.fuel);
      row("transmission", T.opt.transmission[car.transmission] || car.transmission);
      row("condition", T.opt.condition[car.condition] || car.condition);
      row("regionalSpecs", car.regionalSpecs === "unknown" ? null : T.opt.regionalSpecs[car.regionalSpecs] || car.regionalSpecs);
      row("seats", car.seats);
      row("color", car.color);
      row("emirate", T.opt.emirate[l.emirate] || l.emirate);
      ad.appendChild(dl);
      if (l.description) ad.appendChild(el("p", "ls-desc", l.description));
      if (l.seller) {
        ad.appendChild(el("h2", null, T.detail.seller));
        var who = [l.seller.name || T.account[l.seller.accountType] || "—", T.account[l.seller.accountType] || ""];
        ad.appendChild(el(
          "p",
          null,
          who.filter(Boolean).filter(function (v, i, arr) {
            return arr.indexOf(v) === i;
          }).join(" · "),
        ));
        ad.appendChild(el("p", "hint", T.detail.memberSince.replace("{date}", day(l.seller.memberSince))));
        var v = (l.seller.verification || []).map(function (k) {
          return T.verified[k] || k;
        });
        ad.appendChild(el("p", "hint", v.length ? "✓ " + v.join(" · ") : T.detail.noVerification));
      }
      ad.appendChild(el(
        "p",
        "hint",
        T.detail.published.replace("{date}", day(l.publishedAt)) + " · " +
          T.detail.updated.replace("{date}", day(l.lastUpdated)),
      ));
      var tips = el("ul", "ls-safety");
      T.detail.safety.forEach(function (s) {
        tips.appendChild(el("li", null, s));
      });
      ad.appendChild(tips);
      if (l.available) {
        var cmp = el("p", "ac-actions");
        var addBtn = el("button", "ghost small", T.compare.add);
        addBtn.type = "button";
        var cmpOut = el("span", "hint");
        cmpOut.setAttribute("role", "status");
        addBtn.addEventListener("click", function () {
          var ok = F && F.addToCompare(readLS, writeLS, {
            title: l.title,
            priceAed: l.priceAed,
            fuel: car.fuel,
            seats: car.seats,
          }, 4);
          cmpOut.textContent = ok ? T.compare.added + " " : T.compare.full + " ";
          var go = el("a", null, T.compare.open);
          go.href = T.links.carCompare;
          cmpOut.appendChild(go);
        });
        cmp.appendChild(addBtn);
        cmp.appendChild(cmpOut);
        ad.appendChild(cmp);
        showFit({ priceAed: l.priceAed, emirate: l.emirate, condition: car.condition, fuel: car.fuel, seats: car.seats });
        bindFinance(l.priceAed);
      }
      if (l.available) {
        $("ls-enquiry").hidden = false;
        bindEnquiry(id);
      }
      if (l.reportable) {
        $("ls-report").hidden = false;
        bindReport(id);
      }
    }, function () {
      say(T.fail);
    });
  }

  function showFit(ad) {
    var sec = $("ls-fit");
    sec.hidden = false;
    sec.appendChild(el("h2", null, T.fit.h));
    if (!needs) {
      var p0 = el("p", "note", T.fit.setup + " ");
      var a0 = el("a", null, T.fit.setupCta);
      a0.href = T.links.carGuide;
      p0.appendChild(a0);
      sec.appendChild(p0);
      return;
    }
    var f = F.fit(ad, needs);
    if (f.known) sec.appendChild(el("p", "ls-fit", T.fit.summary.replace("{met}", f.met).replace("{known}", f.known)));
    var ul = el("ul", "ls-checks");
    f.checks.forEach(function (c) {
      var li = el("li", c.ok === true ? "ok" : c.ok === false ? "no" : "unknown");
      li.textContent = (c.ok === true ? "✓ " : c.ok === false ? "✗ " : "? ") + T.fit[c.key] + (c.ok === null ? " — " + T.fit.unknown : "");
      ul.appendChild(li);
    });
    sec.appendChild(ul);
  }

  function bindFinance(price) {
    var K = window.PLHCarTools;
    if (!K) return;
    $("ls-finance").hidden = false;
    var out = $("fi-out");
    function calc() {
      var rate = parseFloat($("fi-rate").value);
      var down = parseFloat($("fi-down").value) || 0;
      if (!isFinite(rate)) {
        out.textContent = T.finance.needRate;
        return;
      }
      var r = K.finance({ price: price, down: down, ratePct: rate, months: Number($("fi-months").value), method: $("fi-method").value });
      if (!r) {
        out.textContent = T.finance.needRate;
        return;
      }
      out.textContent = "";
      out.appendChild(el("b", null, T.finance.monthly.replace("{x}", money(Math.round(r.monthly)))));
      out.appendChild(
        el(
          "span",
          "hint",
          " " + T.finance.total.replace("{i}", money(Math.round(r.totalInterest))).replace("{t}", money(Math.round(r.totalPaid))),
        ),
      );
    }
    ["fi-down", "fi-rate", "fi-months", "fi-method"].forEach(function (id) {
      $(id).addEventListener("input", calc);
      $(id).addEventListener("change", calc);
    });
  }

  function bindEnquiry(id) {
    var form = $("e-form"), out = $("e-status"), btn = $("e-send");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      btn.disabled = true;
      out.textContent = "";
      post("/public/listings/" + id + "/enquiry", {
        name: $("e-name").value.trim(),
        email: $("e-email").value.trim() || null,
        phone: $("e-phone").value.trim() || null,
        message: $("e-message").value.trim() || null,
        contactConsent: $("e-contact").checked,
        shareWithSeller: $("e-share").checked,
        lang: T.lang,
      }).then(function (x) {
        if (x.status === 200 && x.body.ok) {
          out.className = "";
          out.textContent = T.enquiry.sent.replace("{ref}", String(x.body.reference || "—").slice(0, 12));
          form.querySelectorAll("input,textarea,button").forEach(function (i) {
            i.disabled = true;
          });
          return;
        }
        out.className = "error";
        out.textContent = T.errors[x.body && x.body.error] || T.fail;
        btn.disabled = false;
      }, function () {
        out.className = "error";
        out.textContent = T.fail;
        btn.disabled = false;
      });
    });
  }

  function bindReport(id) {
    var form = $("r-form-ad"), out = $("rp-status");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      post("/public/listings/" + id + "/report", { reason: $("rp-reason").value, note: $("rp-note").value.trim() || null })
        .then(function (x) {
          out.textContent = x.status === 200 ? T.report.sent : T.errors[x.body && x.body.error] || T.fail;
          if (x.status === 200) form.querySelector("button").disabled = true;
        }, function () {
          out.textContent = T.fail;
        });
    });
  }

  if (T.mode === "search") {
    var p = new URLSearchParams(location.search);
    var opened = false;
    FILTERS.forEach(function (k) {
      var v = p.get(k);
      if (v && v.length <= 60) {
        $("f-" + k).value = v;
        if (MORE.indexOf(k) >= 0) opened = true;
      }
    });
    if (opened) $("f-more").open = true;
    $("ls-fit-setup").hidden = !!needs;
    $("ls-filters").addEventListener("submit", function (e) {
      e.preventDefault();
      search(false);
    });
    $("f-sort").addEventListener("change", function () {
      search(false);
    });
    $("f-reset").addEventListener("click", function () {
      $("ls-filters").reset();
      search(false);
    });
    $("ls-load").addEventListener("click", function () {
      search(true);
    });
    search(false);
  } else detail();
})();
