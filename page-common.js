// Shared browser code for every vertical page (business setup, cars, …): frame guard, attribution (the same keys as
// the property page, so one visitor is one journey), anonymous funnel events, safe DOM building and the optional
// request form posted to the ONE shared intake. DOM is built with createElement/textContent only.
(function (root) {
  "use strict";

  function storeGet(store, k) {
    try {
      return window[store].getItem(k);
    } catch (_) {
      return null;
    }
  }
  function storeSet(store, k, v) {
    try {
      window[store].setItem(k, v);
    } catch (_) { /* private mode */ }
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var s = "";
    for (var i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  }

  /** Returns the page context, or null when the page is framed (framed copies never activate anything). */
  function start() {
    try {
      if (window.top !== window.self) return null;
    } catch (_) {
      return null;
    }
    var T = JSON.parse(document.getElementById("t").textContent);
    var cfg = window.PLH_CONFIG || {};
    var sessionId = storeGet("sessionStorage", "plh_sid") || uuid();
    storeSet("sessionStorage", "plh_sid", sessionId);
    var params = new URLSearchParams(location.search);
    function p(k) {
      var v = params.get(k);
      return v && /^[\p{L}\p{N} ._\-+/:@]{1,120}$/u.test(v) ? v : null;
    }
    var utm = {
      source: p("utm_source"),
      medium: p("utm_medium"),
      campaign: p("utm_campaign"),
      term: p("utm_term"),
      content: p("utm_content"),
    };
    var refCode = (params.get("ref") || "").match(/^[A-Za-z0-9_-]{3,32}$/) ? params.get("ref") : null;
    if (refCode) storeSet("localStorage", "plh_ref", refCode);
    else refCode = storeGet("localStorage", "plh_ref");
    var referrerHost = null;
    try {
      var r = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : null;
      referrerHost = r && r !== location.hostname ? r : null;
    } catch (_) { /* ignore */ }
    var lastTouch = { source: utm.source || referrerHost, medium: utm.medium, campaign: utm.campaign, at: new Date().toISOString() };
    var firstTouch = null;
    try {
      firstTouch = JSON.parse(storeGet("localStorage", "plh_ft") || "null");
    } catch (_) { /* ignore */ }
    if (!firstTouch || typeof firstTouch !== "object") {
      firstTouch = lastTouch;
      storeSet("localStorage", "plh_ft", JSON.stringify(firstTouch));
    }

    function track(event, detail) {
      if (!cfg.api) return;
      var body = JSON.stringify({
        event: event,
        detail: detail || null,
        sessionId: sessionId,
        page: location.pathname.slice(0, 150),
        lang: T.lang,
      });
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
    return {
      T: T,
      cfg: cfg,
      params: params,
      track: track,
      el: el,
      startedAt: Date.now(),
      attribution: function () {
        return {
          lang: T.lang,
          landingPage: location.pathname.replace(/[^A-Za-z0-9/_\-.]/g, "").slice(0, 150) || "/", // same rule as the property page
          utm: utm,
          referrerHost: referrerHost,
          refCode: refCode,
          firstTouch: firstTouch,
          lastTouch: lastTouch,
          sessionId: sessionId,
        };
      },
    };
  }

  /**
   * The optional request form (ids r-*). `answers()` returns the vertical's answers or null when some are missing.
   * Contact + two separate consents are the same on every vertical; the intake validates everything again.
   */
  function bindRequest(ctx, vertical, answers) {
    var T = ctx.T, cfg = ctx.cfg;
    var req = document.getElementById("r-form");
    var status = document.getElementById("r-status");
    var submit = document.getElementById("r-submit");
    var wa = document.getElementById("r-wa");
    var sending = false;
    function offerWhatsapp() {
      if (!cfg.whatsapp) return;
      wa.href = "https://wa.me/" + cfg.whatsapp + "?text=" + encodeURIComponent(T.req.waText);
      wa.hidden = false;
    }
    req.addEventListener("submit", function (e) {
      e.preventDefault();
      if (sending) return;
      var a = answers();
      if (!a) {
        status.textContent = T.req.errors.missing_answers;
        return;
      }
      var v = function (id) {
        return document.getElementById(id).value.trim();
      };
      var payload = Object.assign({ vertical: vertical }, a, ctx.attribution(), {
        name: v("r-name"),
        email: v("r-email") || null,
        phone: v("r-phone") || null,
        country: v("r-country") || null,
        contactConsent: document.getElementById("r-contact").checked,
        referralConsent: document.getElementById("r-referral").checked,
        startedAt: ctx.startedAt,
        website: document.getElementById("r-website").value,
      });
      sending = true;
      submit.disabled = true;
      submit.textContent = T.req.sending;
      status.textContent = "";
      fetch(cfg.api, { method: "POST", body: JSON.stringify(payload), headers: { "content-type": "text/plain" } })
        .then(function (res) {
          return res.json().catch(function () {
            return {};
          }).then(function (j) {
            return { status: res.status, body: j };
          });
        })
        .then(function (x) {
          if (x.status === 200 && x.body && x.body.ok) {
            ctx.track("SUBMIT");
            status.textContent = T.req.ok.replace("{ref}", String(x.body.reference || "—").slice(0, 12));
            submit.hidden = true;
            return;
          }
          var code = x.body && x.body.error;
          status.textContent = T.req.errors[code] || T.req.fail;
          if (x.status >= 500 || x.status === 429 || x.status === 404) offerWhatsapp();
        })
        .catch(function () {
          status.textContent = T.req.fail;
          offerWhatsapp();
        })
        .then(function () {
          sending = false;
          submit.disabled = false;
          submit.textContent = T.req.submit;
        });
    });
  }

  /** Checked value of a radio group, or null. */
  function picked(form, name) {
    var c = form.querySelector('input[name="' + name + '"]:checked');
    return c ? c.value : null;
  }

  root.PLHPage = { start: start, bindRequest: bindRequest, picked: picked };
})(typeof globalThis !== "undefined" ? globalThis : window);
