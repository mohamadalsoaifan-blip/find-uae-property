// Business-setup guide page (BETA). The explained result is computed in the browser (business.js) from the answers;
// nothing is sent until the person asks for help. DOM is built with createElement/textContent only. Analytics: one
// anonymous TOOL event "setup" per visit — never the answers.
(function () {
  "use strict";
  try {
    if (window.top !== window.self) return;
  } catch (_) {
    return;
  }
  var T = JSON.parse(document.getElementById("t").textContent);
  var B = window.PLHBusiness, cfg = window.PLH_CONFIG || {};
  if (!B) return;
  var KEYS = ["activity", "clients", "owners", "visas", "office", "emirate", "setupBudget", "timeline"];
  var form = document.getElementById("biz");
  var out = document.getElementById("biz-out");
  var askList = document.getElementById("biz-ask");
  var startedAt = Date.now();

  function get(store, k) {
    try {
      return window[store].getItem(k);
    } catch (_) {
      return null;
    }
  }
  function set(store, k, v) {
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
  var sessionId = get("sessionStorage", "plh_sid") || uuid();
  set("sessionStorage", "plh_sid", sessionId);

  // attribution: the same keys as the property page, so one visitor is one journey
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
  if (refCode) set("localStorage", "plh_ref", refCode);
  else refCode = get("localStorage", "plh_ref");
  var referrerHost = null;
  try {
    var r = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : null;
    referrerHost = r && r !== location.hostname ? r : null;
  } catch (_) { /* ignore */ }
  var lastTouch = { source: utm.source || referrerHost, medium: utm.medium, campaign: utm.campaign, at: new Date().toISOString() };
  var firstTouch = null;
  try {
    firstTouch = JSON.parse(get("localStorage", "plh_ft") || "null");
  } catch (_) { /* ignore */ }
  if (!firstTouch || typeof firstTouch !== "object") {
    firstTouch = lastTouch;
    set("localStorage", "plh_ft", JSON.stringify(firstTouch));
  }

  var tracked = false;
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
  track("PAGE_VIEW");

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function answers() {
    var a = {};
    KEYS.forEach(function (k) {
      var c = form.querySelector('input[name="b-' + k + '"]:checked');
      a[k] = c ? c.value : null;
    });
    var d = document.getElementById("b-description").value.replace(/\s+/g, " ").trim();
    a.description = d ? d.slice(0, 120) : null;
    return a;
  }

  function render() {
    var a = answers();
    out.textContent = "";
    out.appendChild(el("h2", null, T.resultsH));
    if (!a.clients || !a.activity || !a.office) {
      out.appendChild(el("p", "hint", T.need));
      return;
    }
    if (!tracked) {
      tracked = true;
      track("TOOL", "setup");
    }
    var r = B.paths(a);
    r.paths.forEach(function (x) {
      var card = el("div", "res");
      card.setAttribute("data-path", x.id);
      card.setAttribute("data-fit", x.fit);
      card.appendChild(el("h3", null, T.pathName[x.id]));
      card.appendChild(el("p", "badge", T.fit[x.fit]));
      var ul = el("ul");
      x.reasons.forEach(function (k) {
        ul.appendChild(el("li", null, T.reasons[k]));
      });
      card.appendChild(ul);
      out.appendChild(card);
    });
    if (r.decider) out.appendChild(el("p", "note", T.decide));
    askList.textContent = "";
    r.ask.forEach(function (k) {
      askList.appendChild(el("li", null, T.ask[k]));
    });
  }
  form.addEventListener("change", render);
  render();

  // ------------------------------------------------------------------ optional request (same shared intake)
  var req = document.getElementById("biz-req");
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
    var missing = KEYS.some(function (k) {
      return !a[k];
    });
    if (missing) {
      status.textContent = T.req.errors.missing_answers;
      return;
    }
    var v = function (id) {
      return document.getElementById(id).value.trim();
    };
    var payload = {
      vertical: "business",
      activity: a.activity,
      clients: a.clients,
      owners: a.owners,
      visas: a.visas,
      office: a.office,
      emirate: a.emirate,
      setupBudget: a.setupBudget,
      timeline: a.timeline,
      description: a.description,
      name: v("r-name"),
      email: v("r-email") || null,
      phone: v("r-phone") || null,
      country: v("r-country") || null,
      contactConsent: document.getElementById("r-contact").checked,
      referralConsent: document.getElementById("r-referral").checked,
      lang: T.lang,
      landingPage: location.pathname.replace(/[^A-Za-z0-9/_\-.]/g, "").slice(0, 150) || "/", // same rule as the property page
      utm: utm,
      referrerHost: referrerHost,
      refCode: refCode,
      firstTouch: firstTouch,
      lastTouch: lastTouch,
      sessionId: sessionId,
      startedAt: startedAt,
      website: document.getElementById("r-website").value,
    };
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
          track("SUBMIT");
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
})();
