// Seller account page (/account/). Inert until the listings API reports enabled.
// - Sign-in: the browser talks to Supabase Auth itself (e-mail one-time code or magic link). The code never reaches
//   our functions; our API only ever sees the short-lived access token.
// - Photos are re-encoded on this device (canvas → JPEG) before upload: location/camera metadata is dropped and the
//   size is capped. The server checks every byte again.
// DOM is built with createElement/textContent only. Nothing here is indexed or tracked.
(function () {
  "use strict";
  try {
    if (window.top !== window.self) return; // framed copies never activate
  } catch (_) {
    return;
  }
  var T = JSON.parse(document.getElementById("t").textContent);
  var API = T.listingsApi;
  var KEY = "plh_auth";
  var auth = null; // { url, anonKey }
  var session = null; // { a: access token, r: refresh token, e: expiry (s), m: e-mail }
  var editing = null; // listing id being edited
  var $ = function (id) {
    return document.getElementById(id);
  };
  var status = $("ac-status");
  var nf = new Intl.NumberFormat(T.lang === "ar" ? "ar-AE-u-nu-latn" : "en-AE", { maximumFractionDigits: 0 });

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
  function errText(body) {
    var code = body && body.error;
    if (code === "invalid_fields" && body.fields) {
      return T.errors.invalid_fields.replace(
        "{fields}",
        body.fields.map(function (f) {
          return T.f[f] || f;
        }).join(", "),
      );
    }
    return T.errors[code] || T.fail;
  }

  // ------------------------------------------------------------------ session (this device only)
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || "null");
      return s && typeof s.a === "string" && typeof s.r === "string" ? s : null;
    } catch (_) {
      return null;
    }
  }
  function save(s) {
    session = s;
    try {
      if (s) localStorage.setItem(KEY, JSON.stringify(s));
      else localStorage.removeItem(KEY);
    } catch (_) { /* private mode: session lasts for this tab */ }
  }
  function fromGotrue(j, email) {
    if (!j || typeof j.access_token !== "string" || typeof j.refresh_token !== "string") return null;
    return {
      a: j.access_token,
      r: j.refresh_token,
      e: Math.floor(Date.now() / 1000) + (Number(j.expires_in) || 3600),
      m: (j.user && j.user.email) || email || "",
    };
  }

  function gotrue(path, body, token) {
    var h = { apikey: auth.anonKey, "content-type": "application/json" };
    if (token) h.authorization = "Bearer " + token;
    return fetch(auth.url + "/auth/v1/" + path, { method: "POST", headers: h, body: JSON.stringify(body || {}) })
      .then(function (res) {
        return res.json().catch(function () {
          return {};
        }).then(function (j) {
          return { status: res.status, body: j };
        });
      });
  }
  function refresh() {
    if (!session) return Promise.resolve(false);
    return gotrue("token?grant_type=refresh_token", { refresh_token: session.r }).then(function (x) {
      var s = x.status === 200 ? fromGotrue(x.body, session.m) : null;
      save(s);
      return !!s;
    }, function () {
      return false;
    });
  }
  function fresh() {
    if (session && session.e - 60 > Date.now() / 1000) return Promise.resolve(true);
    return refresh();
  }

  // ------------------------------------------------------------------ listings API
  function call(method, path, body, rawType, retried) {
    return fresh().then(function (ok) {
      if (!ok) return { status: 401, body: { error: "session_expired" } };
      var h = { authorization: "Bearer " + session.a };
      var init = { method: method, headers: h };
      if (rawType) {
        h["content-type"] = rawType;
        init.body = body;
      } else if (body !== undefined) {
        h["content-type"] = "application/json";
        init.body = JSON.stringify(body);
      }
      return fetch(API + path, init).then(function (res) {
        return res.json().catch(function () {
          return {};
        }).then(function (j) {
          return { status: res.status, body: j };
        });
      });
    }).then(function (x) {
      if (x.status === 401 && !retried && session) {
        return refresh().then(function (ok) {
          if (ok) return call(method, path, body, rawType, true);
          signedOut(T.errors.session_expired);
          return x;
        });
      }
      if (x.status === 401) signedOut(T.errors.session_expired);
      return x;
    }, function () {
      return { status: 0, body: {} };
    });
  }

  // ------------------------------------------------------------------ sign-in
  var pendingEmail = "";
  function signedOut(message) {
    save(null);
    $("ac-in").hidden = true;
    $("ac-signin").hidden = false;
    $("ac-email-form").hidden = false;
    $("ac-code-form").hidden = true;
    say(message || "");
  }
  $("ac-email-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var email = $("ac-email").value.trim().toLowerCase();
    if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i.test(email)) return say(T.errors.invalid_email);
    $("ac-send").disabled = true;
    var back = location.origin + location.pathname;
    gotrue("otp?redirect_to=" + encodeURIComponent(back), { email: email, create_user: true }).then(function (x) {
      if (x.status === 200) {
        pendingEmail = email;
        $("ac-sent").textContent = T.signIn.sent.replace("{email}", email);
        $("ac-email-form").hidden = true;
        $("ac-code-form").hidden = false;
        say("");
        $("ac-code").focus();
      } else say(x.status === 429 ? T.errors.too_many : x.status === 400 || x.status === 422 ? T.errors.invalid_email : T.fail);
    }, function () {
      say(T.fail);
    }).then(function () {
      $("ac-send").disabled = false;
    });
  });
  $("ac-code-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var code = $("ac-code").value.replace(/\s/g, "");
    if (!/^\d{6,10}$/.test(code)) return say(T.errors.invalid_code);
    $("ac-verify").disabled = true;
    gotrue("verify", { type: "email", email: pendingEmail, token: code }).then(function (x) {
      var s = x.status === 200 ? fromGotrue(x.body, pendingEmail) : null;
      if (!s) return say(x.status === 429 ? T.errors.too_many : T.errors.invalid_code);
      save(s);
      $("ac-code").value = "";
      signedIn();
    }, function () {
      say(T.fail);
    }).then(function () {
      $("ac-verify").disabled = false;
    });
  });
  $("ac-again").addEventListener("click", function () {
    signedOut("");
    $("ac-email").focus();
  });
  $("ac-out").addEventListener("click", function () {
    var s = session;
    if (s) gotrue("logout", {}, s.a).catch(function () {});
    signedOut("");
  });

  /** Magic link: Supabase sends the browser back with the tokens in the #fragment (never sent to any server). */
  function takeFragment() {
    if (!location.hash || location.hash.length < 2) return;
    var p = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, "", location.pathname + location.search); // tokens out of the address bar + history
    if (p.get("error") || p.get("error_description")) return say(T.errors.invalid_code);
    var s = fromGotrue({ access_token: p.get("access_token"), refresh_token: p.get("refresh_token"), expires_in: p.get("expires_in") });
    if (s) save(s);
  }

  // ------------------------------------------------------------------ signed in
  function signedIn() {
    $("ac-signin").hidden = true;
    $("ac-in").hidden = false;
    say(T.loading);
    call("GET", "/me").then(function (x) {
      if (x.status !== 200) return x.status === 401 ? null : say(errText(x.body));
      say("");
      var p = x.body.profile || {};
      $("ac-who").textContent = T.signedInAs.replace("{email}", session ? session.m || "—" : "—");
      $("ac-name").value = p.displayName || "";
      var badges = (x.body.verification || []).map(function (v) {
        return T.profile.verified[v] || v;
      });
      $("ac-badges").textContent = badges.length ? "✓ " + badges.join(" · ") : "";
      if ((x.body.verification || []).indexOf("email_verified") < 0) $("ac-badges").textContent = T.profile.unverified;
      loadMine();
    });
  }
  $("ac-profile").addEventListener("submit", function (e) {
    e.preventDefault();
    call("PATCH", "/me", { displayName: $("ac-name").value.trim(), preferredLanguage: T.lang }).then(function (x) {
      say(x.status === 200 ? T.profile.saved : errText(x.body));
    });
  });

  // ------------------------------------------------------------------ add / edit a car
  var FIELDS = [
    "make",
    "model",
    "trim",
    "year",
    "mileageKm",
    "fuel",
    "transmission",
    "condition",
    "regionalSpecs",
    "seats",
    "color",
    "vin",
  ];
  var NUM = { year: 1, mileageKm: 1, seats: 1, priceAed: 1 };
  function val(name) {
    var v = $("c-" + name).value.trim();
    if (v === "") return null;
    return NUM[name] ? Number(v) : v;
  }
  function carPayload() {
    var d = {};
    FIELDS.forEach(function (k) {
      d[k] = val(k);
    });
    return { vertical: "cars", priceAed: val("priceAed"), emirate: val("emirate"), description: val("description"), details: d };
  }
  function resetForm() {
    editing = null;
    $("ac-car").reset();
    $("ac-form-h").textContent = T.add.h;
    $("c-save").textContent = T.add.save;
    $("c-cancel").hidden = true;
    $("c-status").textContent = "";
  }
  function startEdit(id) {
    call("GET", "/listings/" + id).then(function (x) {
      if (x.status !== 200) return say(errText(x.body));
      var l = x.body.listing, car = l.car || {};
      editing = id;
      $("c-priceAed").value = l.priceAed;
      $("c-emirate").value = l.emirate;
      $("c-description").value = l.description || "";
      FIELDS.forEach(function (k) {
        if (k !== "vin") $("c-" + k).value = car[k] == null ? "" : car[k];
      });
      $("c-vin").value = ""; // the VIN is stored only as a fingerprint; leave empty to keep it
      $("ac-form-h").textContent = T.add.edit;
      $("c-save").textContent = T.add.update;
      $("c-cancel").hidden = false;
      $("ac-form-h").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  $("c-cancel").addEventListener("click", resetForm);
  $("ac-car").addEventListener("submit", function (e) {
    e.preventDefault();
    var body = carPayload();
    if (editing && body.details.vin === null) delete body.details.vin;
    $("c-save").disabled = true;
    $("c-status").textContent = "";
    call(editing ? "PATCH" : "POST", editing ? "/listings/" + editing : "/listings", body).then(function (x) {
      if (x.status !== 200) {
        $("c-status").textContent = errText(x.body);
        return;
      }
      resetForm();
      say(T.done);
      loadMine();
    }).then(function () {
      $("c-save").disabled = false;
    });
  });

  // ------------------------------------------------------------------ photos (re-encoded on this device)
  var MAX_SIDE = 2000, MIN_W = 400, MIN_H = 300, MAX_BYTES = 3 * 1024 * 1024;
  function reencode(file) {
    if (!/^image\//.test(file.type)) return Promise.reject("unsupported_type");
    if (!window.createImageBitmap || !HTMLCanvasElement.prototype.toBlob) {
      if (file.type !== "image/jpeg" && file.type !== "image/webp") return Promise.reject("unsupported_type");
      return file.size > MAX_BYTES ? Promise.reject("too_large") : Promise.resolve(file); // the server still checks
    }
    return createImageBitmap(file, { imageOrientation: "from-image" }).then(function (bmp) {
      var w = bmp.width, h = bmp.height;
      if (w < MIN_W || h < MIN_H) throw "too_small_dimensions";
      var k = Math.min(1, MAX_SIDE / Math.max(w, h));
      var cv = document.createElement("canvas");
      cv.width = Math.round(w * k);
      cv.height = Math.round(h * k);
      cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
      if (bmp.close) bmp.close();
      return new Promise(function (ok, fail) {
        cv.toBlob(
          function (b) {
            if (!b) return fail("corrupt");
            if (b.size > MAX_BYTES) return fail("too_large");
            ok(b);
          },
          "image/jpeg",
          0.85,
        );
      });
    }, function (e) {
      throw typeof e === "string" ? e : "corrupt";
    });
  }
  function upload(id, file, out) {
    out.textContent = T.loading;
    reencode(file).then(function (blob) {
      return call("POST", "/listings/" + id + "/images", blob, blob.type || "image/jpeg");
    }).then(function (x) {
      out.textContent = x.status === 200 ? T.done : errText(x.body);
      if (x.status === 200) loadMine();
    }, function (code) {
      out.textContent = T.errors[code] || T.fail;
    });
  }

  // ------------------------------------------------------------------ my listings
  var ACTIONS = {
    DRAFT: ["edit", "archive"],
    CHANGES_REQUESTED: ["edit", "archive"],
    PENDING_REVIEW: ["withdraw"],
    ACTIVE: ["pause", "sold", "archive"],
    PAUSED: ["resume", "sold", "archive"],
    EXPIRED: ["renew", "archive"],
    REJECTED: ["archive"],
  };
  var EDITABLE = { DRAFT: 1, CHANGES_REQUESTED: 1 };
  function photos(id, box) {
    call("GET", "/listings/" + id).then(function (x) {
      if (x.status !== 200) return;
      var media = x.body.media || [];
      box.textContent = "";
      box.appendChild(el("p", "hint", T.mine.photos.replace("{n}", media.length)));
      var row = el("div", "ac-thumbs");
      media.forEach(function (m) {
        var fig = el("figure", "ac-thumb");
        if (m.url) {
          var img = el("img");
          img.src = m.url;
          img.alt = "";
          img.loading = "lazy";
          fig.appendChild(img);
        }
        var rm = el("button", "ghost small", "×");
        rm.type = "button";
        rm.setAttribute("aria-label", T.add.cancel);
        rm.addEventListener("click", function () {
          call("DELETE", "/listings/" + id + "/images/" + m.id).then(function (y) {
            if (y.status === 200) photos(id, box);
            else say(errText(y.body));
          });
        });
        fig.appendChild(rm);
        row.appendChild(fig);
      });
      box.appendChild(row);
    });
  }
  function card(l) {
    var c = el("article", "ac-listing");
    if (l.cover && l.cover.url) {
      var img = el("img", "ac-cover");
      img.src = l.cover.url;
      img.alt = "";
      img.loading = "lazy";
      c.appendChild(img);
    }
    c.appendChild(el("h3", null, l.title));
    c.appendChild(el("p", null, (T.lang === "ar" ? "درهم " : "AED ") + nf.format(l.priceAed)));
    var st = el("p", "ac-st ac-st-" + String(l.status).toLowerCase(), T.status[l.status] || l.status);
    c.appendChild(st);
    if (!l.publiclyVisible) c.appendChild(el("p", "hint", T.mine.publicNo));
    if (l.rejectReason) c.appendChild(el("p", "error", T.reasons[l.rejectReason] || l.rejectReason));
    if (l.moderatorNote) c.appendChild(el("p", "note", l.moderatorNote));
    var out = el("p", "hint");
    out.setAttribute("role", "status");
    if (EDITABLE[l.status]) {
      var pics = el("div");
      c.appendChild(pics);
      photos(l.id, pics);
      var lab = el("label", "cta secondary ac-file");
      lab.appendChild(el("span", null, T.mine.addPhoto));
      var inp = el("input");
      inp.type = "file";
      inp.accept = "image/jpeg,image/webp,image/png,image/heic";
      inp.addEventListener("change", function () {
        if (inp.files && inp.files[0]) upload(l.id, inp.files[0], out);
        inp.value = "";
      });
      lab.appendChild(inp);
      c.appendChild(lab);
      var sub = el("button", null, T.mine.submit);
      sub.type = "button";
      sub.addEventListener("click", function () {
        sub.disabled = true;
        call("POST", "/listings/" + l.id + "/submit").then(function (x) {
          sub.disabled = false;
          out.textContent = x.status === 200 ? T.done : errText(x.body);
          if (x.status === 200) loadMine();
        });
      });
      c.appendChild(sub);
    }
    var acts = el("p", "ac-actions");
    (ACTIONS[l.status] || []).forEach(function (a) {
      var b = el("button", "ghost small", T.action[a]);
      b.type = "button";
      b.addEventListener("click", function () {
        if (a === "edit") return startEdit(l.id);
        b.disabled = true;
        call("POST", "/listings/" + l.id + "/action", { action: a }).then(function (x) {
          b.disabled = false;
          out.textContent = x.status === 200 ? T.done : errText(x.body);
          if (x.status === 200) loadMine();
        });
      });
      acts.appendChild(b);
    });
    c.appendChild(acts);
    c.appendChild(out);
    return c;
  }
  function loadMine() {
    var box = $("ac-mine");
    call("GET", "/listings/mine").then(function (x) {
      if (x.status !== 200) return;
      box.textContent = "";
      var list = (x.body.listings || []).filter(function (l) {
        return l.status !== "ARCHIVED";
      });
      if (!list.length) box.appendChild(el("p", "hint", T.mine.empty));
      list.forEach(function (l) {
        box.appendChild(card(l));
      });
    });
  }

  // ------------------------------------------------------------------ start
  fetch(API + "/health").then(function (r) {
    return r.json();
  }).then(function (h) {
    if (!h || !h.enabled) throw "off";
    return fetch(API + "/auth-config").then(function (r) {
      return r.json().then(function (j) {
        if (r.status !== 200 || !j.url || !j.anonKey) throw "off";
        return j;
      });
    });
  }).then(function (cfg) {
    auth = { url: String(cfg.url).replace(/\/+$/, ""), anonKey: String(cfg.anonKey) };
    session = load();
    takeFragment();
    if (session) {
      fresh().then(function (ok) {
        if (!ok) return signedOut(T.errors.session_expired);
        if (!session.m) {
          // magic link: ask Supabase Auth for the e-mail of this session (shown to the user only)
          fetch(auth.url + "/auth/v1/user", { headers: { apikey: auth.anonKey, authorization: "Bearer " + session.a } })
            .then(function (r) {
              return r.json();
            }).then(function (u) {
              if (u && u.email) save(Object.assign({}, session, { m: u.email }));
              $("ac-who").textContent = T.signedInAs.replace("{email}", session.m || "—");
            }).catch(function () {});
        }
        signedIn();
      });
    } else signedOut("");
  }).catch(function () {
    say(T.off);
  });
})();
