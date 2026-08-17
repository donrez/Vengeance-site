(function () {
  "use strict";

  var DEFAULT_LANG = "en";
  var LANGUAGES = ["en", "pl", "ru"];
  var LS_LANG = "xtz_lang";
  var LS_ADMIN = "xtz_admin_token";

  var I18N = window.XTZ_I18N || {};

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

  function applyLanguage(lang) {
    currentLang = lang;
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (I18N[lang] && I18N[lang][key]) el.textContent = I18N[lang][key];
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

  function getToken() {
    try {
      return localStorage.getItem(LS_ADMIN) || "";
    } catch (e) {
      return "";
    }
  }

  function setToken(t) {
    try {
      if (t) localStorage.setItem(LS_ADMIN, t);
      else localStorage.removeItem(LS_ADMIN);
    } catch (e) {}
  }

  function api(path, body) {
    var opts = { method: "POST", headers: { "Content-Type": "application/json" } };
    var token = getToken();
    if (token) opts.headers.Authorization = "Bearer " + token;
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
    var el = document.getElementById("admin-error");
    if (el) {
      el.textContent = msg;
      el.classList.add("show");
    }
  }

  function hideError() {
    var el = document.getElementById("admin-error");
    if (el) el.classList.remove("show");
  }

  var gate = document.getElementById("admin-gate");
  var panel = document.getElementById("admin-panel");

  function showPanel() {
    gate.style.display = "none";
    panel.style.display = "";
    loadKeys();
    loadUsers();
  }

  function showGate() {
    setToken("");
    gate.style.display = "";
    panel.style.display = "none";
  }

  /* ---------- password gate ---------- */
  document.getElementById("admin-form").addEventListener("submit", function (e) {
    e.preventDefault();
    hideError();
    var btn = this.querySelector("button[type=submit]");
    btn.disabled = true;
    api("/api/admin/login", { password: document.getElementById("admin-password").value })
      .then(function (data) {
        btn.disabled = false;
        setToken(data.token);
        showPanel();
      })
      .catch(function () {
        btn.disabled = false;
        var d = I18N[currentLang] || {};
        showError(d["admin.errCreate"] || "Error");
      });
  });

  /* ---------- logout ---------- */
  document.getElementById("admin-logout").addEventListener("click", function () {
    api("/api/admin/logout", {})
      .catch(function () {})
      .then(function () {
        showGate();
      });
  });

  /* ---------- tabs ---------- */
  document.querySelectorAll(".admin-tabs button[data-tab]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".admin-tabs button[data-tab]").forEach(function (b) {
        b.classList.toggle("active", b === btn);
      });
      document.getElementById("tab-keys").style.display = btn.getAttribute("data-tab") === "keys" ? "" : "none";
      document.getElementById("tab-users").style.display = btn.getAttribute("data-tab") === "users" ? "" : "none";
    });
  });

  /* ---------- keys ---------- */
  function esc(s) {
    var div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  }

  function loadKeys() {
    api("/api/admin/keys", {})
      .then(function (data) {
        var body = document.getElementById("keys-body");
        body.innerHTML = "";
        data.keys.forEach(function (k) {
          var tr = document.createElement("tr");
          var used = k.used === 1;
          tr.innerHTML =
            '<td class="mono' + (used ? " used" : "") + '">' + esc(k.key) + "</td>" +
            '<td>' + (used ? '<span class="badge used-badge">' + esc(k.used_by || "?") + "</span>" : '<span class="badge free-badge">free</span>') + "</td>" +
            "<td>" + esc(k.activated_at || "—") + "</td>" +
            '<td><button type="button" class="revoke-btn" data-key="' + esc(k.key) + '">' + esc(k.used ? "revoke" : "delete") + "</button></td>";
          body.appendChild(tr);
        });
        body.querySelectorAll(".revoke-btn").forEach(function (btn) {
          btn.addEventListener("click", function () {
            api("/api/admin/keys/revoke", { key: btn.getAttribute("data-key") })
              .then(loadKeys)
              .catch(function () {
                showError("Error");
              });
          });
        });
      })
      .catch(function () {
        showGate();
      });
  }

  document.getElementById("btn-generate").addEventListener("click", function () {
    hideError();
    var count = parseInt(document.getElementById("key-count").value, 10) || 1;
    api("/api/admin/keys/generate", { count: count })
      .then(function () {
        loadKeys();
      })
      .catch(function () {
        showError("Error");
      });
  });

  document.getElementById("btn-copy").addEventListener("click", function () {
    var keys = Array.prototype.map.call(
      document.querySelectorAll("#keys-body .mono"),
      function (td) {
        return td.textContent;
      }
    );
    if (!keys.length) return;
    var text = keys.join("\n");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      var ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  });

  /* ---------- users ---------- */
  function loadUsers() {
    api("/api/admin/users", {})
      .then(function (data) {
        var body = document.getElementById("users-body");
        body.innerHTML = "";
        data.users.forEach(function (u) {
          var tr = document.createElement("tr");
          tr.innerHTML =
            "<td>" + u.id + "</td>" +
            "<td>" + esc(u.username) + "</td>" +
            "<td>" + esc(u.email) + "</td>" +
            '<td><span class="badge ' + (u.subscription === "lifetime" ? "free-badge" : "used-badge") + '">' + esc(u.subscription) + "</span></td>" +
            '<td class="mono">' + esc(u.hwid || "—") + "</td>" +
            '<td><button type="button" class="reset-btn" data-user="' + esc(u.username) + '">reset</button></td>';
          body.appendChild(tr);
        });
        body.querySelectorAll(".reset-btn").forEach(function (btn) {
          btn.addEventListener("click", function () {
            api("/api/admin/hwid/reset", { username: btn.getAttribute("data-user") })
              .then(loadUsers)
              .catch(function () {
                showError("Error");
              });
          });
        });
      })
      .catch(function () {
        showGate();
      });
  }

  /* ---------- boot ---------- */
  if (getToken()) {
    showPanel();
  } else {
    showGate();
  }

  applyLanguage(currentLang);
})();