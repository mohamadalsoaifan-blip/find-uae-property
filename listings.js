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

  // ------------------------------------------------------------------ search
  function search() {
    var q = new URLSearchParams({ vertical: "cars" });
    ["make", "model", "emirate", "maxPrice", "minYear"].forEach(function (k) {
      var v = $("f-" + k).value.trim();
      if (v) q.set(k, v);
    });
    say(T.loading);
    var box = $("ls-results");
    get("/public/listings?" + q.toString()).then(function (x) {
      box.textContent = "";
      if (x.status !== 200 || !x.body.open) {
        $("ls-filters").hidden = true;
        return say(T.closed);
      }
      var list = x.body.results || [];
      say(list.length ? "" : T.empty);
      list.forEach(function (r) {
        if (!ID.test(r.id)) return;
        var a = el("a", "ls-card");
        a.href = T.links.listing + "?id=" + r.id;
        if (r.cover && r.cover.url) a.appendChild(img(r.cover.url, "ls-cover"));
        a.appendChild(el("h2", null, r.title));
        a.appendChild(el("p", "ls-price", money(r.priceAed)));
        var meta = [T.opt.emirate[r.emirate] || r.emirate];
        if (r.mileageKm != null) meta.push(nf.format(r.mileageKm) + " " + T.card.km);
        a.appendChild(el("p", "hint", meta.join(" · ")));
        box.appendChild(a);
      });
    }, function () {
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
    ["make", "model", "emirate", "maxPrice", "minYear"].forEach(function (k) {
      var v = p.get(k);
      if (v && v.length <= 60) $("f-" + k).value = v;
    });
    $("ls-filters").addEventListener("submit", function (e) {
      e.preventDefault();
      search();
    });
    search();
  } else detail();
})();
