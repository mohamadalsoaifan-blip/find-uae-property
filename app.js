// Landing page behaviour: progressive 7-step buyer form, attribution, anonymous funnel events, zero-loss posting.
// No cookies, no third-party scripts, no fingerprinting. Storage is used only inside try/catch and is optional.
(function () {
  "use strict";
  var cfg = window.PLH_CONFIG || {};
  var T = JSON.parse(document.getElementById("t").textContent);
  var form = document.getElementById("buyer-form");
  if (!form || !cfg.api) return;
  var steps = Array.prototype.slice.call(form.querySelectorAll(".step"));
  var total = steps.length;
  var current = 1;
  var startedAt = Date.now();
  var formStarted = false;
  var sending = false;
  var page = location.pathname.replace(/[^A-Za-z0-9/_\-.]/g, "").slice(0, 150) || "/";

  // ------------------------------------------------------------------ safe storage
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
    } catch (_) { /* private mode: fine */ }
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var s = "";
    for (var i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  }
  // random id for THIS tab only (funnel counting); never linked to a person by the page
  var sessionId = get("sessionStorage", "plh_sid") || uuid();
  set("sessionStorage", "plh_sid", sessionId);

  // ------------------------------------------------------------------ attribution
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
  var channelHint = utm.medium ? String(utm.medium).toUpperCase().replace(/[^A-Z_]/g, "").slice(0, 20) || null : null;

  // ------------------------------------------------------------------ anonymous funnel events (never block the page)
  function track(event, step) {
    var body = JSON.stringify({
      event: event,
      step: step == null ? null : step,
      sessionId: sessionId,
      page: page,
      lang: T.lang,
      channel: channelHint,
    });
    var url = cfg.api + (cfg.api.indexOf("?") < 0 ? "?" : "&") + "event=1";
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(url, body)) return;
      fetch(url, { method: "POST", body: body, keepalive: true, headers: { "content-type": "text/plain" } }).catch(function () {});
    } catch (_) { /* analytics are optional */ }
  }
  track("PAGE_VIEW");
  var cta = document.getElementById("cta");
  if (cta) {
    cta.addEventListener("click", function () {
      track("CTA_CLICK");
    });
  }

  // ------------------------------------------------------------------ answers survive refresh (this tab only)
  var SAVE_KEY = "plh_answers";
  function answers() {
    var d = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.name === "website") return;
      if (el.type === "radio") {
        if (el.checked) d[el.name] = el.value;
      } else if (el.type === "checkbox") d[el.name] = el.checked;
      else d[el.name] = el.value.trim();
    });
    return d;
  }
  function save() {
    set("sessionStorage", SAVE_KEY, JSON.stringify(answers()));
  }
  (function restore() {
    var d;
    try {
      d = JSON.parse(get("sessionStorage", SAVE_KEY) || "null");
    } catch (_) {
      d = null;
    }
    if (!d) return;
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || !(el.name in d)) return;
      if (el.type === "radio") el.checked = d[el.name] === el.value;
      else if (el.type === "checkbox") el.checked = d[el.name] === true;
      else if (typeof d[el.name] === "string") el.value = d[el.name];
    });
  })();

  // ------------------------------------------------------------------ steps
  var back = document.getElementById("back");
  var next = document.getElementById("next");
  var submit = document.getElementById("submit");
  var errorBox = document.getElementById("form-error");
  var label = document.getElementById("step-label");
  var bar = document.getElementById("step-bar");

  function showError(code) {
    if (!code) {
      errorBox.hidden = true;
      errorBox.textContent = "";
      return;
    }
    errorBox.textContent = T.errors[code] || T.errors.generic;
    errorBox.hidden = false;
  }
  function show(n) {
    current = Math.max(1, Math.min(total, n));
    steps.forEach(function (s, i) {
      s.hidden = i + 1 !== current;
    });
    label.textContent = T.stepOf.replace("{n}", current).replace("{total}", total);
    bar.style.width = Math.round((current / total) * 100) + "%";
    back.hidden = current === 1;
    next.hidden = current === total;
    submit.hidden = current !== total;
    showError(null);
  }
  function stepValid(n) {
    var radios = steps[n - 1].querySelectorAll("input[type=radio]");
    if (!radios.length) return true;
    return Array.prototype.some.call(radios, function (r) {
      return r.checked;
    });
  }
  function focusStep() {
    var legend = steps[current - 1].querySelector("legend");
    if (legend) {
      legend.setAttribute("tabindex", "-1");
      legend.focus({ preventScroll: false });
    }
  }
  function advance() {
    if (!stepValid(current)) return showError("missing_answers");
    track("STEP", current);
    save();
    show(current + 1);
    focusStep();
  }
  function startOnce() {
    if (formStarted) return;
    formStarted = true;
    startedAt = Date.now();
    track("FORM_START");
  }
  form.addEventListener("focusin", startOnce);
  form.addEventListener("change", function (e) {
    startOnce();
    save();
    // one tap per question: choosing an option moves on (except step 1, which also has an optional area field)
    if (e.target.type === "radio" && current > 1 && current < total) setTimeout(advance, 180);
  });
  next.addEventListener("click", advance);
  back.addEventListener("click", function () {
    show(current - 1);
    focusStep();
  });

  // ------------------------------------------------------------------ WhatsApp (official click-to-chat link only)
  function whatsappLink(d) {
    if (!cfg.whatsapp) return null;
    var L = T.labels;
    var parts = [
      L.location[d.location],
      d.area,
      L.propertyType[d.propertyType],
      L.budget[d.budget],
      L.purpose[d.purpose],
      L.timeline[d.timeline],
      L.payment[d.payment],
    ].filter(Boolean);
    return "https://wa.me/" + cfg.whatsapp + "?text=" + encodeURIComponent(T.whatsappText + " " + parts.join(" · "));
  }
  function offerWhatsapp(id, d) {
    var href = whatsappLink(d);
    var a = document.getElementById(id);
    if (!href || !a) return;
    a.href = href;
    a.parentNode.hidden = false;
    a.addEventListener("click", function () {
      track("WHATSAPP_CLICK");
    }, { once: true });
  }

  // ------------------------------------------------------------------ submit (answers are kept until the server confirms)
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (sending) return;
    var d = answers();
    if (!d.name || d.name.length < 2) return showError("name_required");
    if (!d.email && !d.phone) return showError("contact_required");
    if (!d.contactConsent) return showError("contact_consent_required");
    for (var i = 1; i < total; i++) {
      if (!stepValid(i)) {
        show(i);
        return showError("missing_answers");
      }
    }
    var payload = {
      location: d.location,
      area: d.area || null,
      propertyType: d.propertyType,
      budget: d.budget,
      purpose: d.purpose,
      timeline: d.timeline,
      payment: d.payment,
      name: d.name,
      email: d.email || null,
      phone: d.phone || null,
      country: d.country || null,
      contactConsent: d.contactConsent === true,
      referralConsent: d.referralConsent === true,
      lang: T.lang,
      landingPage: page,
      utm: utm,
      referrerHost: referrerHost,
      refCode: refCode,
      firstTouch: firstTouch,
      lastTouch: lastTouch,
      sessionId: sessionId,
      startedAt: startedAt,
      website: form.elements.website.value,
    };
    sending = true;
    submit.disabled = true;
    submit.textContent = T.sending;
    showError(null);
    // text/plain = a "simple" CORS request (no preflight round-trip on slow mobile networks)
    fetch(cfg.api, { method: "POST", body: JSON.stringify(payload), headers: { "content-type": "text/plain" } })
      .then(function (res) {
        return res.json().catch(function () {
          return {};
        }).then(function (j) {
          return { status: res.status, body: j };
        });
      })
      .then(function (r) {
        if (r.status === 200 && r.body && r.body.ok) {
          track("SUBMIT", total);
          try {
            sessionStorage.removeItem(SAVE_KEY);
          } catch (_) { /* ignore */ }
          form.hidden = true;
          document.getElementById("ref").textContent = String(r.body.reference || "—").slice(0, 12);
          document.getElementById("done").hidden = false;
          offerWhatsapp("wa-done", d);
          document.getElementById("done").scrollIntoView({ block: "start" });
          return;
        }
        var code = r.body && r.body.error;
        showError(r.status === 429 ? "too_many_requests" : T.errors[code] ? code : "generic");
        if (r.status >= 500) offerWhatsapp("wa-fallback", d);
      })
      .catch(function () {
        showError("network");
        offerWhatsapp("wa-fallback", d);
      })
      .then(function () {
        sending = false;
        submit.disabled = false;
        submit.textContent = T.submit;
      });
  });

  show(1);
})();
