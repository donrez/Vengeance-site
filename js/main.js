(function () {
  "use strict";

  var DEFAULT_LANG = "en";
  var LANGUAGES = ["en", "pl", "ru"];
  var LANG_LABELS = { en: "EN", pl: "PL", ru: "RU" };
  var LS_KEY = "xtz_lang";

  var NAME = "Vengeance";
  var EMAIL = "xtzprotect@mail.ru";
  var YEAR = new Date().getFullYear();

  var I18N = window.XTZ_I18N || {};

  function fmt(value) {
    if (typeof value !== "string") return "";
    return value.replace(/\{(\w+)\}/g, function (m, key) {
      if (key === "name") return NAME;
      if (key === "email") return EMAIL;
      if (key === "year") return String(YEAR);
      return "{" + key + "}";
    });
  }

  function detectLang() {
    var saved = null;
    try {
      saved = localStorage.getItem(LS_KEY);
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

  function buildTitle(el, text) {
    var words = text.split(/\s+/);
    var frag = document.createDocumentFragment();
    words.forEach(function (word, i) {
      var span = document.createElement("span");
      span.className = "title-word";
      span.style.animationDelay = 0.25 + i * 0.12 + "s";
      span.textContent = word;
      frag.appendChild(span);
    });
    el.innerHTML = "";
    el.appendChild(frag);
  }

  function animateSsrtitle(el) {
    var spans = el.querySelectorAll(":scope > span");
    spans.forEach(function (span, i) {
      span.style.animation =
        "title-in 0.9s cubic-bezier(0.22, 1, 0.36, 1) forwards " + (0.25 + i * 0.12) + "s";
    });
  }

  function applyLanguage(lang) {
    var dict = I18N[lang] || I18N[DEFAULT_LANG] || {};
    currentLang = lang;
    document.documentElement.lang = lang;

    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (dict[key]) el.textContent = fmt(dict[key]);
    });

    document.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-title");
      if (dict[key]) buildTitle(el, fmt(dict[key]));
    });

    var langLabel = document.querySelector(".lang-label");
    if (langLabel) langLabel.textContent = LANG_LABELS[lang];

    document.querySelectorAll("[data-lang-root] [data-lang]").forEach(function (btn) {
      var active = btn.getAttribute("data-lang") === lang;
      btn.classList.toggle("text-[#B5B3B3]", active);
      btn.classList.toggle("bg-white/3", active);
      btn.classList.toggle("text-[#a8a8a870]", !active);
      btn.classList.toggle("hover:text-[#B5B3B3]", !active);
      btn.classList.toggle("hover:bg-white/3", !active);
      var check = btn.querySelector(".lang-check");
      if (check) check.style.visibility = active ? "visible" : "hidden";
    });

    try {
      localStorage.setItem(LS_KEY, lang);
    } catch (e) {}
  }

  /* ---------- header: language dropdown ---------- */
  var langRoot = document.querySelector("[data-lang-root]");
  if (langRoot) {
    var toggle = langRoot.querySelector(".lang-toggle");
    var menu = langRoot.querySelector(".lang-menu");

    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      menu.classList.toggle("hidden");
    });

    document.addEventListener("mousedown", function (e) {
      if (langRoot && !langRoot.contains(e.target)) menu.classList.add("hidden");
    });

    langRoot.querySelectorAll("[data-lang]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyLanguage(btn.getAttribute("data-lang"));
        menu.classList.add("hidden");
      });
    });
  }

  /* ---------- header: nav scroll / mobile filter ---------- */
  var navButtons = Array.prototype.slice.call(
    document.querySelectorAll('header [data-nav-href]')
  );

  function applyMobileFilter() {
    var isMobile = window.innerWidth < 500;
    navButtons.forEach(function (btn) {
      var href = btn.getAttribute("data-nav-href");
      var keep = href === "/home";
      if (isMobile && !keep) btn.classList.add("hidden");
      else btn.classList.remove("hidden");
    });
  }

  navButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var href = btn.getAttribute("data-nav-href");
      if (href === "/home") {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (href.indexOf("/home#") === 0) {
        var id = href.replace("/home#", "");
        var target = document.getElementById(id);
        if (target) {
          target.scrollIntoView({ behavior: "smooth" });
          return;
        }
      }
    });
  });

  applyMobileFilter();
  window.addEventListener("resize", applyMobileFilter);

  /* ---------- header: auth state (profile button) ---------- */
  var authWrap = document.querySelector("header .auth-buttons");

  function buildProfileButton() {
    var btn = document.createElement("a");
    btn.href = "/profile";
    btn.className =
      "cursor-pointer flex items-center gap-1.5 px-4 py-1.5 rounded-[6px] text-sm font-medium bg-[var(--accent-color)] text-white border border-white/30 transition-all duration-300 hover:opacity-50";
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user text-white" aria-hidden="true"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg><span data-i18n="nav.profile">Profile</span>';
    return btn;
  }

  function applyAuthState() {
    if (!authWrap) return;
    var token = "";
    try {
      token = localStorage.getItem("xtz_token") || "";
    } catch (e) {}
    if (token) {
      fetch("/api/me", { headers: { Authorization: "Bearer " + token } })
        .then(function (r) {
          if (!r.ok) throw new Error("bad");
          return r.json();
        })
        .then(function () {
          if (authWrap.classList.contains("guest")) {
            authWrap.innerHTML = "";
            authWrap.appendChild(buildProfileButton());
            authWrap.classList.remove("guest");
            applyLanguage(currentLang);
          }
        })
        .catch(function () {
          try {
            localStorage.removeItem("xtz_token");
          } catch (e) {}
          if (!authWrap.classList.contains("guest")) {
            authWrap.innerHTML =
              '<a href="/registration" class="group border border-white/5 flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] cursor-pointer"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-plus text-[#a8a8a870] transition-colors duration-300 group-hover:text-[#B5B3B3]" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" x2="19" y1="8" y2="14"></line><line x1="22" x2="16" y1="11" y2="11"></line></svg><span class="text-sm font-medium text-[#a8a8a870] transition-colors duration-300 group-hover:text-[#B5B3B3]" data-i18n="nav.register">Register</span></a><a href="/authorization" class="cursor-pointer flex items-center gap-1.5 px-4 py-1.5 rounded-[6px] text-sm font-medium bg-[var(--accent-color)] text-white border border-white/30 transition-all duration-300 hover:opacity-50"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-log-in text-white" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" x2="3" y1="12" y2="12"></line></svg><span data-i18n="nav.login">Login</span></a>';
            authWrap.classList.add("guest");
          }
        });
    } else {
      if (!authWrap.classList.contains("guest")) {
        authWrap.innerHTML =
          '<a href="/registration" class="group border border-white/5 flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] cursor-pointer"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-plus text-[#a8a8a870] transition-colors duration-300 group-hover:text-[#B5B3B3]" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" x2="19" y1="8" y2="14"></line><line x1="22" x2="16" y1="11" y2="11"></line></svg><span class="text-sm font-medium text-[#a8a8a870] transition-colors duration-300 group-hover:text-[#B5B3B3]" data-i18n="nav.register">Register</span></a><a href="/authorization" class="cursor-pointer flex items-center gap-1.5 px-4 py-1.5 rounded-[6px] text-sm font-medium bg-[var(--accent-color)] text-white border border-white/30 transition-all duration-300 hover:opacity-50"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-log-in text-white" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" x2="3" y1="12" y2="12"></line></svg><span data-i18n="nav.login">Login</span></a>';
        authWrap.classList.add("guest");
      }
    }
  }

  applyAuthState();

  /* ---------- effects: animate SSR title spans ---------- */
  document.querySelectorAll("[data-i18n-title]").forEach(animateSsrtitle);

  /* ---------- noise overlay ---------- */
  var canvas = document.querySelector(".noise-overlay");
  if (canvas && canvas.getContext) {
    var ctx = canvas.getContext("2d");
    var size = 128;

    function makeNoise() {
      var noiseData = ctx.createImageData(size, size);
      var d = noiseData.data;
      for (var i = 0; i < d.length; i += 4) {
        var v = Math.random() * 255;
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
        d[i + 3] = 18;
      }
      ctx.putImageData(noiseData, 0, 0);
      canvas.style.backgroundImage = "url(" + canvas.toDataURL("image/png") + ")";
    }

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    resize();
    makeNoise();
    window.addEventListener("resize", resize);
  }

  /* ---------- light pillars ---------- */
  var pillars = document.querySelector(".light-pillar-container");
  if (pillars) {
    for (var i = 0; i < 3; i++) {
      var p = document.createElement("div");
      p.className = "light-pillar";
      pillars.appendChild(p);
    }
  }

  /* ---------- reveal on scroll ---------- */
  var revealEls = document.querySelectorAll(".opacity-0.translate-y-6");

  function show(el, delay) {
    setTimeout(function () {
      el.classList.add("revealed");
    }, delay || 0);
  }

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            show(entry.target);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    revealEls.forEach(function (el, i) {
      var section = el.closest("section");
      if (section && section.classList.contains("h-screen")) {
        show(el, 150);
      } else {
        io.observe(el);
      }
    });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add("revealed");
    });
  }

  /* ---------- apply detected language ---------- */
  applyLanguage(currentLang);
})();
