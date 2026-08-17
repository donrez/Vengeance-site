const fs = require("fs");

let html = fs.readFileSync("_ref_main.html", "utf8");

/* ===== Brand rename ===== */
html = html.replace(/Dettex/g, "Vengeance");

/* ===== Video embed ===== */
html = html.replace(
  "https://www.youtube.com/embed/NLExGH9Cmlc?autoplay=0&amp;rel=0",
  "https://www.youtube.com/embed/DyGU1KU0qOo?autoplay=0&amp;rel=0"
);

/* ===== HEAD: drop every Next.js tag, keep raw SSR body ===== */

html = html.replace(/<head>[\s\S]*?<\/head>/, "<HEADPLACEHOLDER>");

html = html
  .replace(/<script[^>]*>[\s\S]*?<\/script>/g, "")
  .replace(/<script[^>]*\/>/g, "");

html = html.replace("<HEADPLACEHOLDER>", "<HEADPLACEHOLDER/>");

/* ===== 1. Hero badge (not translated, hardcoded like original) ===== */
html = html.replace(
  "</svg>Ho ho! You found me!</p>",
  "</svg><span data-i18n-static=\"home.badge\">Ho ho! You found me!</span></p>"
);

/* ===== 2. Hero title (blur spans rebuilt by main.js) ===== */
html = html.replace(
  '<p class="text-6xl sm:text-4xl font-semibold md:text-7xl lg:text-7xl mb-6 sm:mb-8 text-welcome" style="display:flex;justify-content:center;flex-wrap:wrap">',
  '<p class="text-6xl sm:text-4xl font-semibold md:text-7xl lg:text-7xl mb-6 sm:mb-8 text-welcome" style="display:flex;justify-content:center;flex-wrap:wrap" data-i18n-title="home.welcome">'
);

/* ===== 3. Hero subtitle ===== */
html = html.replace(
  ">Stop looking back at the rules<br/> <!-- -->and make the most of the game!</p>",
  '><span data-i18n="home.subtitle1">Stop looking back at the rules</span><br/> <span data-i18n="home.subtitle2">and make the most of the game!</span></p>'
);

/* ===== 4. Hero buttons ===== */
html = html.replace(
  '</svg>Products</button>',
  '</svg><span data-i18n="home.products">Products</span></button>'
);
html = html.replace(
  '<span class="text-sm font-medium text-[#a8a8a870] transition-colors duration-300 group-hover:text-[#B5B3B3]">Advantages</span>',
  '<span class="text-sm font-medium text-[#a8a8a870] transition-colors duration-300 group-hover:text-[#B5B3B3]" data-i18n="home.advantages">Advantages</span>'
);

/* ===== 5. Advantages section ===== */
html = html.replace(
  "</svg>Advantages</p>",
  '</svg><span data-i18n="home.advantages.tag">Advantages</span></p>'
);
html = html.replace(
  '<p class="text-centertext-5xl sm:text-4xl font-semibold md:text-5xl lg:text-5xl sm:mb-4 text-welcome pt-8" style="display:flex;justify-content:center;flex-wrap:wrap">',
  '<p class="text-centertext-5xl sm:text-4xl font-semibold md:text-5xl lg:text-5xl sm:mb-4 text-welcome pt-8" style="display:flex;justify-content:center;flex-wrap:wrap" data-i18n-title="home.advantages.title">'
);
html = html.replace(
  '>Discover the core features that set Vengeance apart from the competition.</p>',
  '><span data-i18n="home.advantages.subtitle">Discover the core features that set Vengeance apart from the competition.</span></p>'
);

/* ===== 6. Feature cards ===== */
const FEATURE_KEYS = {
  "Peak Performance": "feature.performance",
  "Advanced Security": "feature.security",
  "Intuitive Interface": "feature.ui",
  "Continuous Updates": "feature.updates",
  "Priority Support": "feature.support",
  "Elite Capabilities": "feature.elite",
};
html = html.replace(
  /<span class="text-home-title  text-\[14px\] leading-tight font-medium">([^<]+)<\/span>/g,
  (m, t) => {
    const k = FEATURE_KEYS[t];
    return k
      ? `<span class="text-home-title  text-[14px] leading-tight font-medium" data-i18n="${k}.title">${t}</span>`
      : m;
  }
);
html = html.replace(
  /<span class="text-user-login opacity-50 text-\[13px\] leading-tight">([^<]+)<\/span>/g,
  (m, t) => {
    const k = FEATURE_KEYS[t];
    return k
      ? `<span class="text-user-login opacity-50 text-[13px] leading-tight" data-i18n="${k}.body">${t}</span>`
      : m;
  }
);

/* ===== 7. Video section ===== */
html = html.replace(
  "</svg>Video</p>",
  '</svg><span data-i18n="home.video.tag">Video</span></p>'
);
html = html.replace(
  '<p class="text-center text-5xl sm:text-4xl font-semibold md:text-5xl lg:text-5xl sm:mb-4 text-welcome pt-8" style="display:flex;justify-content:center;flex-wrap:wrap">',
  '<p class="text-center text-5xl sm:text-4xl font-semibold md:text-5xl lg:text-5xl sm:mb-4 text-welcome pt-8" style="display:flex;justify-content:center;flex-wrap:wrap" data-i18n-title="home.video.title">'
);
html = html.replace(
  '>Take a look at the official video with the client!</p>',
  '><span data-i18n="home.video.subtitle">Take a look at the official video with the client!</span></p>'
);

/* ===== 8. Footer taglines ===== */
html = html.replace(
  '<p class="text-home-text text-sm">All the best is with us!</p>',
  '<p class="text-home-text text-sm" data-i18n="footer.tagline1">All the best is with us!</p>'
);
html = html.replace(
  '<p class="text-home-text text-sm">Quickly join us!</p>',
  '<p class="text-home-text text-sm" data-i18n="footer.tagline2">Quickly join us!</p>'
);

/* ===== 9. Footer links ===== */
html = html.replace(
  'title="Products" href="/profile">',
  'title="Products" href="#">'
);
html = html.replace(
  'title="Privacy Policy" href="/info/privacypolicy">',
  'title="Privacy Policy" href="#">'
);
html = html.replace(
  'title="Terms of Service" href="/info/termsofservice">',
  'title="Terms of Service" href="#">'
);
html = html.replace(
  '<span class="text-sm font-medium hidden sm:inline text-home-text ml-1 transition-colors duration-300">Products</span>',
  '<span class="text-sm font-medium hidden sm:inline text-home-text ml-1 transition-colors duration-300" data-i18n="footer.products">Products</span>'
);
html = html.replace(
  '<span class="text-sm font-medium hidden sm:inline text-home-text ml-1 transition-colors duration-300">Privacy Policy</span>',
  '<span class="text-sm font-medium hidden sm:inline text-home-text ml-1 transition-colors duration-300" data-i18n="footer.privacy">Privacy Policy</span>'
);
html = html.replace(
  '<span class="text-sm font-medium hidden sm:inline text-home-text ml-1 transition-colors duration-300">Terms of Service</span>',
  '<span class="text-sm font-medium hidden sm:inline text-home-text ml-1 transition-colors duration-300" data-i18n="footer.terms">Terms of Service</span>'
);

/* ===== 10. Feedback email (Cloudflare) -> mailto ===== */
html = html.replace(
  'href="/cdn-cgi/l/email-protection#5a222e202a28352e3f392e1a373b333674282f"',
  'href="mailto:xtzprotect@mail.ru"'
);
html = html.replace(
  '<span class="__cf_email__" data-cfemail="ea929e909a98859e8f899eaa878b8386c4989f">[email&#160;protected]</span>',
  '<span data-i18n="footer.feedback">Feedback: xtzprotect@mail.ru</span>'
);

/* ===== 11. Footer TIN / rights / disclaimer ===== */
html = html.replace(
  '<p class="text-all-rights text-sm">TIN: 673111363976</p>',
  '<p class="text-all-rights text-sm" data-i18n="footer.inn">TIN: 673111363976</p>'
);
html = html.replace(
  '<p class="text-all-rights text-sm">© 2026 Dettex Client. All rights reserved.</p>',
  '<p class="text-all-rights text-sm" data-i18n="footer.rights">© 2026 Dettex Client. All rights reserved.</p>'
);
html = html.replace(
  '<p class="text-all-rights text-sm">Our product is not affiliated with © Mojang and © Microsoft</p>',
  '<p class="text-all-rights text-sm" data-i18n="footer.disclaimer">Our product is not affiliated with © Mojang and © Microsoft</p>'
);

/* ===== 12. Header (exact replica of the client-rendered one) ===== */

const HEADER_NAV = [
  {
    title: "Home",
    href: "/home",
    i18n: "nav.home",
    icon:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-house" aria-hidden="true"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"></path><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>',
  },
  {
    title: "Advantages",
    href: "/home#advantages",
    i18n: "nav.advantages",
    icon:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-medal" aria-hidden="true"><path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"></path><path d="M11 12 5.12 2.2"></path><path d="m13 12 5.88-9.8"></path><path d="M8 7h8"></path><circle cx="12" cy="17" r="5"></circle><path d="M12 18v-2h-.5"></path></svg>',
  },
  {
    title: "Video",
    href: "/home#video",
    i18n: "nav.video",
    icon:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-video" aria-hidden="true"><path d="m22 8-6 4 6 4V8Z"></path><rect width="14" height="12" x="2" y="6" rx="2" ry="2"></rect></svg>',
  },
];

const navMarkup = HEADER_NAV.map(
  (n) =>
    `<button type="button" title="${n.title}" data-nav-href="${n.href}" class="cursor-pointer group flex items-center gap-1.5 px-3 py-1.5 rounded-md"><span class="text-pinkpinkDark transition-colors duration-300 group-hover:text-[var(--text-color-acc)]">${n.icon}</span><span class="text-sm font-medium hidden sm:inline text-[var(--text-color)] ml-1" data-i18n="${n.i18n}">${n.title}</span></button>`
).join("\n      ");

const langOptions = [
  { code: "en", label: "EN" },
  { code: "pl", label: "PL" },
  { code: "ru", label: "RU" },
];

const langMarkup = langOptions
  .map(
    (l) =>
      `<button type="button" data-lang="${l.code}" class="w-full flex items-center justify-between px-3 py-1.5 text-sm transition-colors duration-200 cursor-pointer"><span class="font-medium tracking-wider">${l.label}</span><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check lang-check" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg></button>`
  )
  .join("\n                ");

const header = `<header class="fixed top-0 left-0 right-0 z-50 p-4.5">
  <div class="max-w-[1200px] mx-auto">
    <div class="relative backdrop-blur-md rounded-lg border border-white/3 bg-black/5 shadow-lg shadow-black/8">
      <div class="flex items-center justify-between px-4 py-3">
        <div class="flex items-center gap-2">
      ${navMarkup}
        </div>
        <div class="flex items-center gap-2">
          <div class="relative" data-lang-root>
            <button type="button" title="Language" data-i18n-title-static="nav.language" class="lang-toggle group border border-white/5 flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] cursor-pointer">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-globe text-[#a8a8a870] transition-colors duration-300 group-hover:text-[#B5B3B3]" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path></svg>
              <span class="lang-label text-sm font-medium text-[#a8a8a870] transition-colors duration-300 group-hover:text-[#B5B3B3] tracking-wider">EN</span>
            </button>
            <div class="lang-menu absolute right-0 top-[calc(100%+6px)] z-50 min-w-[110px] rounded-[8px] border border-white/5 bg-black/40 backdrop-blur-md shadow-lg shadow-black/20 overflow-hidden hidden">
                ${langMarkup}
            </div>
          </div>
          <div class="auth-buttons guest flex items-center gap-2">
          <a href="/registration" class="group border border-white/5 flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-plus text-[#a8a8a870] transition-colors duration-300 group-hover:text-[#B5B3B3]" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" x2="19" y1="8" y2="14"></line><line x1="22" x2="16" y1="11" y2="11"></line></svg>
            <span class="text-sm font-medium text-[#a8a8a870] transition-colors duration-300 group-hover:text-[#B5B3B3]" data-i18n="nav.register">Register</span>
          </a>
          <a href="/authorization" class="cursor-pointer flex items-center gap-1.5 px-4 py-1.5 rounded-[6px] text-sm font-medium bg-[var(--accent-color)] text-white border border-white/30 transition-all duration-300 hover:opacity-50">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-log-in text-white" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" x2="3" y1="12" y2="12"></line></svg>
            <span data-i18n="nav.login">Login</span>
          </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</header>`;

html = html.replace('<div class="h-[74px]"></div>', '<div class="h-[74px]"></div>\n' + header);

/* ===== 13. Assemble document ===== */

const bodyOpen = html.indexOf("<body");
const bodyClose = html.lastIndexOf("</body>");
let bodyContent = html.slice(bodyOpen, bodyClose);

bodyContent = bodyContent.replace(/<HEADPLACEHOLDER\/>/g, "");

const doc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Vengeance</title>
  <meta name="description" content="Vengeance — лучшее DLC для комфортной игры в Minecraft!"/>
  <link rel="icon" href="/favicon.ico"/>
  <link rel="stylesheet" href="/css/vesence.css?v=8"/>
  <link rel="stylesheet" href="/css/custom.css?v=8"/>
</head>
${bodyContent}
<script src="/js/dict.js?v=8"></script>
<script src="/js/main.js?v=8"></script>
</body>
</html>`;

fs.writeFileSync("index.html", doc);
console.log("index.html written:", doc.length, "bytes");
