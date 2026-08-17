(function () {
  "use strict";

  var DEFAULT_LANG = "en";
  var LANGUAGES = ["en", "pl", "ru"];
  var LANG_LABELS = { en: "EN", pl: "PL", ru: "RU" };
  var LS_LANG = "xtz_lang";
  var LS_TOKEN = "xtz_token";

  var I18N = window.XTZ_I18N || {};
  var page = document.body.getAttribute("data-page");

  function detectLang() {
    var saved = null;
    try {
      saved = localStorage.getItem(LS_LANG);
    } catch (e) {}
    if (saved && LANGUAGES.indexOf(saved) !== -1) return saved;
    var nav = "";
    try {
      nav = (navigator.language || "").slice(0, 2).toLowerCase();
    } catch (e) {}
    if (LANGUAGES.indexOf(nav) !== -1) return nav;
    return DEFAULT_LANG;
  }

  var currentLang = detectLang();

  function t(key) {
    var dict = I18N[currentLang] || I18N[DEFAULT_LANG] || {};
    return dict[key] !== undefined ? dict[key] : key;
  }

  function applyLanguage(lang) {
    currentLang = lang;
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (I18N[lang] && I18N[lang][key]) el.textContent = I18N[lang][key];
    });
    document.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
      var spec = el.getAttribute("data-i18n-attr");
      var parts = spec.split("|");
      if (I18N[lang] && I18N[lang][parts[1]]) el.setAttribute(parts[0], I18N[lang][parts[1]]);
    });
    document.querySelectorAll(".auth-langs button").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-lang") === lang);
    });
    try {
      localStorage.setItem(LS_LANG, lang);
    } catch (e) {}
  }

  document.querySelectorAll(".auth-langs button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      applyLanguage(btn.getAttribute("data-lang"));
    });
  });

  /* ---------- noise overlay ---------- */
  var canvas = document.querySelector(".noise-overlay");
  if (canvas && canvas.getContext) {
    var ctx = canvas.getContext("2d");
    var size = 128;
    function makeNoise() {
      var data = ctx.createImageData(size, size);
      var d = data.data;
      for (var i = 0; i < d.length; i += 4) {
        var v = Math.random() * 255;
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
        d[i + 3] = 18;
      }
      ctx.putImageData(data, 0, 0);
      canvas.style.backgroundImage = "url(" + canvas.toDataURL("image/png") + ")";
    }
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    makeNoise();
    window.addEventListener("resize", function () {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    });
  }

  /* ---------- API ---------- */
  function getToken() {
    try {
      return localStorage.getItem(LS_TOKEN) || "";
    } catch (e) {
      return "";
    }
  }

  function setToken(token) {
    try {
      if (token) localStorage.setItem(LS_TOKEN, token);
      else localStorage.removeItem(LS_TOKEN);
    } catch (e) {}
  }

  function api(path, body) {
    var opts = { method: "POST", headers: { "Content-Type": "application/json" } };
    var token = getToken();
    if (token) opts.headers.Authorization = "Bearer " + token;
    try {
      opts.headers["X-HWID"] = window.deviceHwid();
    } catch (e) {}
    if (body) opts.body = JSON.stringify(body);
    return fetch(path, opts).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) {
          var err = new Error(data.error || "server");
          err.code = data.error;
          throw err;
        }
        return data;
      });
    });
  }

  function showError(msg) {
    var el = document.querySelector(".auth-error");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
  }

  function hideError() {
    var el = document.querySelector(".auth-error");
    if (el) el.classList.remove("show");
  }

  function showOk(msg) {
    var el = document.querySelector(".auth-ok");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
  }

  function connError() {
    var d = I18N[currentLang] || {};
    return d["reg.err.connection"] || "Could not connect to the server";
  }

  /* ---------- registration ---------- */
  if (page === "registration") {
    var regForm = document.getElementById("reg-form");
    if (regForm) {
      regForm.addEventListener("submit", function (e) {
        e.preventDefault();
        hideError();

        var email = document.getElementById("reg-email").value.trim();
        var username = document.getElementById("reg-username").value.trim();
        var password = document.getElementById("reg-password").value;
        var repeat = document.getElementById("reg-repeat").value;
        var agree = document.getElementById("reg-agree").checked;
        var d = I18N[currentLang] || {};

        if (!email || !username || !password || !repeat)
          return showError(d["reg.err.fill"] || "Fill in all fields");
        if (password !== repeat)
          return showError(d["reg.err.passMatch"] || "Passwords do not match");
        if (!agree) return showError(d["reg.err.policy"] || "Accept the privacy policy");

        var btn = regForm.querySelector("button[type=submit]");
        btn.disabled = true;
        api("/api/register", { email: email, username: username, password: password })
          .then(function (data) {
            setToken(data.token);
            window.location.href = "/profile";
          })
          .catch(function (err) {
            btn.disabled = false;
            if (err.code === "exists")
              return showError(d["reg.err.fail"] || "Registration error");
            if (err.code === "username")
              return showError(d["reg.err.fill"] || "Fill in all fields");
            if (err.code === "email" || err.code === "password")
              return showError(d["reg.err.fill"] || "Fill in all fields");
            showError(connError());
          });
      });
    }
  }

  /* ---------- authorization ---------- */
  if (page === "authorization") {
    if (getToken()) window.location.href = "/profile";

    var authForm = document.getElementById("auth-form");
    if (authForm) {
      authForm.addEventListener("submit", function (e) {
        e.preventDefault();
        hideError();

        var username = document.getElementById("auth-username").value.trim();
        var password = document.getElementById("auth-password").value;
        var d = I18N[currentLang] || {};

        if (!username || !password)
          return showError(d["reg.err.fill"] || "Fill in all fields");

        var btn = authForm.querySelector("button[type=submit]");
        btn.disabled = true;
        api("/api/login", { username: username, password: password })
          .then(function (data) {
            setToken(data.token);
            window.location.href = "/profile";
          })
          .catch(function (err) {
            btn.disabled = false;
            if (err.code === "bad")
              return showError(d["auth.err.login"] || "Login error");
            if (err.code === "hwid")
              return showError(d["auth.err.hwid"] || "HWID mismatch. This account is bound to another device.");
            showError(connError());
          });
      });
    }
  }

  /* ---------- profile ---------- */
  if (page === "profile") {
    var token = getToken();
    if (!token) {
      window.location.href = "/authorization";
      return;
    }

    var profileBox = document.getElementById("profile-box");
    profileBox.style.display = "none";

    var device = "";
    try {
      device = window.deviceHwid();
    } catch (e) {}
    var deviceEl = document.getElementById("p-device");
    if (deviceEl) deviceEl.textContent = device;

    api("/api/me", {})
      .then(function (data) {
        var u = data.user;
        document.getElementById("p-username").textContent = u.username;
        document.getElementById("p-email").textContent = u.email;
        document.getElementById("p-sub").textContent =
          u.subscription === "lifetime"
            ? (I18N[currentLang] && I18N[currentLang]["profile.subscription.lifetime"]) || "LifeTime"
            : (I18N[currentLang] && I18N[currentLang]["profile.subscription.none"]) || "None";
        document.getElementById("p-hwid").textContent = u.hwid || "—";
        document.getElementById("p-hwid-input").value = u.hwid || "";
        profileBox.style.display = "";
      })
      .catch(function () {
        setToken("");
        window.location.href = "/authorization";
      });

    var hwidForm = document.getElementById("hwid-form");
    if (hwidForm) {
      hwidForm.addEventListener("submit", function (e) {
        e.preventDefault();
        hideError();
        var btn = hwidForm.querySelector("button[type=submit]");
        btn.disabled = true;
        api("/api/hwid", { hwid: document.getElementById("p-hwid-input").value.trim() })
          .then(function (data) {
            btn.disabled = false;
            document.getElementById("p-hwid").textContent = data.user.hwid || "—";
            showOk(t("profile.password.ok"));
          })
          .catch(function () {
            btn.disabled = false;
            showError(connError());
          });
      });
    }

    var keyForm = document.getElementById("key-form");
    if (keyForm) {
      keyForm.addEventListener("submit", function (e) {
        e.preventDefault();
        hideError();
        var btn = keyForm.querySelector("button[type=submit]");
        btn.disabled = true;
        api("/api/key/activate", { key: document.getElementById("p-key").value.trim() })
          .then(function (data) {
            btn.disabled = false;
            document.getElementById("p-sub").textContent =
              (I18N[currentLang] && I18N[currentLang]["profile.subscription.lifetime"]) || "LifeTime";
            document.getElementById("p-key").value = "";
            showOk(t("profile.key.ok"));
          })
          .catch(function (err) {
            btn.disabled = false;
            if (err.code === "notfound" || err.code === "used")
              return showError(t("profile.key.err"));
            showError(connError());
          });
      });
    }

    var logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        api("/api/logout", {})
          .catch(function () {})
          .then(function () {
            setToken("");
            window.location.href = "/authorization";
          });
      });
    }
  }

  applyLanguage(currentLang);
})();