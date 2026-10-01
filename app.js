// Landing page behaviour: progressive 7-step buyer form, attribution, anonymous funnel events, zero-loss posting.
// No cookies, no third-party scripts, no fingerprinting. Storage is used only inside try/catch and is optional.
(function () {
  "use strict";
  // Anti-clickjacking: the static host cannot send frame-ancestors, so a framed copy of the page never activates
  // the form (without this script the form cannot submit at all: CSP form-action 'none', no action attribute).
  try {
    if (window.top !== window.self) return;
  } catch (_) {
    return;
  }
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
  function track(event, step, detail) {
    var body = JSON.stringify({
      event: event,
      step: step == null ? null : step,
      detail: detail || null,
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
    if (current === total) renderBrief();
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
    // skip questions already answered (by the one-sentence box or a quick start); back still visits them
    var n = current + 1;
    while (n < total && stepValid(n) && steps[n - 1].querySelector("input[type=radio]")) n++;
    show(n);
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
          if (r.body.chat) startConcierge(r.body.chat);
          document.getElementById("done").scrollIntoView({ block: "start" });
          return;
        }
        var code = r.body && r.body.error;
        showError(r.status === 429 ? "too_many_requests" : T.errors[code] ? code : "generic");
        if (r.status >= 500 || r.status === 429) offerWhatsapp("wa-fallback", d); // never leave a real buyer without a way to reach us
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

  // ------------------------------------------------------------------ optional concierge (fixed questions; text only via textContent)
  function startConcierge(chat) {
    var box = document.getElementById("concierge");
    var log = document.getElementById("cc-log");
    var chipsBox = document.getElementById("cc-chips");
    var input = document.getElementById("cc-input");
    var send = document.getElementById("cc-send");
    var formRow = document.getElementById("cc-form");
    if (!box || !chat || !chat.id || !chat.token) return;
    var busy = false;
    function bubble(text, me) {
      var el = document.createElement("div");
      el.className = "cc-msg" + (me ? " me" : "");
      el.textContent = text;
      log.appendChild(el);
    }
    function render(r) {
      (r.messages || []).forEach(function (m) {
        bubble(String(m));
      });
      chipsBox.textContent = "";
      var chips = r.chips || [];
      if (r.multi) {
        chips.forEach(function (c) {
          var l = document.createElement("label");
          var cb = document.createElement("input");
          cb.type = "checkbox";
          cb.value = c.value;
          l.appendChild(cb);
          l.appendChild(document.createTextNode(c.label));
          chipsBox.appendChild(l);
        });
        var go = document.createElement("button");
        go.type = "button";
        go.textContent = T.concierge.cont;
        go.addEventListener("click", function () {
          var picked = Array.prototype.slice.call(chipsBox.querySelectorAll("input:checked")).map(function (x) {
            return x.value;
          });
          var labels = Array.prototype.slice.call(chipsBox.querySelectorAll("input:checked")).map(function (x) {
            return x.parentNode.textContent;
          });
          talk(labels.join(", ") || "—", { field: "mustHaves", value: picked.join(",") });
        });
        chipsBox.appendChild(go);
      } else {
        chips.forEach(function (c) {
          var b = document.createElement("button");
          b.type = "button";
          b.textContent = c.label;
          b.addEventListener("click", function () {
            talk(c.label, { field: c.field, value: c.value });
          });
          chipsBox.appendChild(b);
        });
      }
      if (r.done) {
        formRow.hidden = true;
        chipsBox.textContent = "";
      }
    }
    function post(message, choice, n) {
      return fetch(cfg.api + (cfg.api.indexOf("?") < 0 ? "?" : "&") + "chat=1", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify({ id: chat.id, token: chat.token, lang: T.lang, message: message, choice: choice || null }),
      }).then(function (res) {
        // the request may still be processing for a moment: wait and retry a few times
        if (res.status === 409 && n < 4) {
          return new Promise(function (ok) {
            setTimeout(ok, 1500);
          }).then(function () {
            return post(message, choice, n + 1);
          });
        }
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      });
    }
    function talk(shown, choice) {
      if (busy) return;
      var message = choice ? "" : input.value.trim().slice(0, 300);
      if (shown) bubble(shown, true);
      if (!choice && !message && shown !== null) return;
      busy = true;
      send.disabled = true;
      input.value = "";
      post(message, choice, 0)
        .then(render)
        .catch(function () {
          bubble(T.concierge.error);
          formRow.hidden = true;
          chipsBox.textContent = "";
        })
        .then(function () {
          busy = false;
          send.disabled = false;
        });
    }
    send.addEventListener("click", function () {
      var v = input.value.trim();
      if (v) talk(v, null);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        send.click();
      }
    });
    box.hidden = false;
    talk(null, null);
  }

  // ------------------------------------------------------------------ buyer brief: value BEFORE contact details
  var ANSWER_STEPS = ["location", "propertyType", "budget", "purpose", "timeline", "payment"];
  var VAGUE = { not_sure: 1, undecided: 1, other: 1 };
  function item(list, text, cls) {
    var li = document.createElement("li");
    if (cls) li.className = cls;
    li.textContent = text;
    list.appendChild(li);
  }
  function chosenLabels(d) {
    var out = [];
    ANSWER_STEPS.forEach(function (name) {
      var v = d[name];
      if (v && !VAGUE[v] && T.labels[name] && T.labels[name][v]) out.push(T.labels[name][v]);
      if (name === "location" && d.area) out.push(d.area);
    });
    return out;
  }
  // tips follow ONLY from the buyer's own answers; general questions, never prices, returns or legal claims
  function briefTips(d) {
    var keys = [];
    if (d.purpose === "investment") keys.push("investment", "charges");
    if (d.purpose === "relocation") keys.push("relocation", "family");
    if (d.purpose === "residence") keys.push("family");
    if (d.payment === "mortgage") keys.push("mortgage");
    if (d.payment === "cash") keys.push("cash");
    if (d.timeline === "immediately" || d.timeline === "lt30d") keys.push("urgent");
    if (d.timeline === "exploring") keys.push("exploring");
    keys = keys.slice(0, 4);
    keys.push("licence");
    return keys;
  }
  function renderBrief() {
    var box = document.getElementById("brief");
    if (!box || !T.brief) return;
    var d = answers();
    var chosen = document.getElementById("brief-chosen");
    var tips = document.getElementById("brief-tips");
    chosen.textContent = "";
    tips.textContent = "";
    chosenLabels(d).forEach(function (t) {
      item(chosen, t);
    });
    briefTips(d).forEach(function (k) {
      if (T.brief[k]) item(tips, T.brief[k]);
    });
    box.hidden = false;
  }

  // ------------------------------------------------------------------ one sentence → answers (site/intent.js, on THIS device)
  function openSteps() {
    var n = 0;
    for (var i = 1; i < total; i++) if (!stepValid(i)) n++;
    return n;
  }
  var intentForm = document.getElementById("intent");
  if (intentForm && window.PLHIntent && T.intent) {
    var intentOut = document.getElementById("intent-out");
    var understoodBox = document.getElementById("understood");
    var say = function (box, text) {
      box.textContent = "";
      var el = document.createElement("p");
      el.textContent = text;
      box.appendChild(el);
      box.hidden = false;
    };
    intentForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var I = T.intent;
      var r = window.PLHIntent.parse(document.getElementById("intent-q").value, T.lang);
      // only the CATEGORY and how many answers were understood leave the device — never the sentence
      track("INTENT", r.understood.length, r.scope);
      understoodBox.hidden = true;
      if (r.scope === "rent") return say(intentOut, I.rent);
      if (I.needs[r.scope]) return say(intentOut, I.outOfScope.replace("{x}", I.needs[r.scope]));
      intentOut.hidden = true;
      Object.keys(r.answers).forEach(function (name) {
        var el = form.querySelector('input[type=radio][name="' + name + '"][value="' + r.answers[name] + '"]');
        if (el) el.checked = true;
      });
      if (r.area && form.elements.area && !form.elements.area.value) form.elements.area.value = r.area;
      startOnce();
      save();
      if (!r.understood.length) {
        say(understoodBox, I.nothing);
      } else {
        understoodBox.textContent = "";
        var h = document.createElement("p");
        h.className = "understood-h";
        h.textContent = I.understood;
        var ul = document.createElement("ul");
        ul.className = "brief-chips";
        chosenLabels(answers()).forEach(function (t) {
          item(ul, t);
        });
        var left = openSteps();
        var tail = document.createElement("p");
        tail.className = "hint";
        tail.textContent = left ? I.remaining.replace("{n}", left) : I.allSet;
        understoodBox.appendChild(h);
        understoodBox.appendChild(ul);
        understoodBox.appendChild(tail);
        understoodBox.hidden = false;
      }
      show(firstOpenStep());
      document.getElementById("find").scrollIntoView({ block: "start" });
      focusStep();
    });
  }

  // ------------------------------------------------------------------ quick starts (one page for every kind of buyer)
  function firstOpenStep() {
    for (var i = 1; i < total; i++) if (!stepValid(i)) return i;
    return total;
  }
  function applyQuick(slug) {
    var pre = T.quick && T.quick[slug];
    if (!pre) return false;
    Object.keys(pre).forEach(function (name) {
      var el = form.querySelector('input[type=radio][name="' + name + '"][value="' + pre[name] + '"]');
      if (el) el.checked = true;
    });
    if (!utm.content) utm.content = slug; // which quick start the buyer used (shown in attribution)
    save();
    return true;
  }
  Array.prototype.forEach.call(document.querySelectorAll("[data-for]"), function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      track("CTA_CLICK");
      if (applyQuick(a.getAttribute("data-for"))) {
        startOnce();
        show(firstOpenStep());
        document.getElementById("find").scrollIntoView({ block: "start" });
        focusStep();
      }
    });
  });
  // answers carried over from the calculators page (?budget=2to5m&payment=mortgage): only exact option values
  var carried = false;
  ["location", "budget", "payment", "propertyType", "purpose", "timeline"].forEach(function (name) {
    var val = params.get(name);
    if (!val || !/^[a-z0-9_]{2,20}$/.test(val)) return;
    var el = form.querySelector('input[type=radio][name="' + name + '"][value="' + val + '"]');
    if (el) {
      el.checked = true;
      carried = true;
    }
  });
  if (carried) {
    if (!utm.content) utm.content = "tools";
    save();
  }
  var forSlug = params.get("for");
  if (forSlug && /^[a-z0-9-]{3,40}$/.test(forSlug) && applyQuick(forSlug)) show(firstOpenStep());
  else show(carried ? firstOpenStep() : 1);
})();
