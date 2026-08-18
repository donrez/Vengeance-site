// ==========================================
// SECTION: Layouts & Core Routing
// ==========================================

const RouteTransition = ({ children }) => {
  return JSX.jsx(motion.div, {
    initial: { opacity: 0, filter: "blur(1.5px)" },
    animate: { opacity: 1, filter: "blur(0px)" },
    exit: { opacity: 0, filter: "blur(1.5px)" },
    transition: { duration: 0.35, ease: "easeInOut" },
    children: children,
  });
};

const AppBackground = ({ children }) => {
  return JSX.jsx("div", { className: Wo.background, children: children });
};

const AppLayout = () => {
  const location = usePresence();

  React.useEffect(() => {
    // Disable right-click context menu
    document.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });

    // Disable F5 and reload shortcuts
    const blockedKeys = ["F5"];
    document.addEventListener("keydown", (e) => {
      blockedKeys.forEach((key) => {
        if (
          e.key === key ||
          (e.ctrlKey && e.shiftKey && e.key === key) ||
          (e.ctrlKey && e.key === key)
        ) {
          e.preventDefault();
        }
      });
    });

    // Disable middle/right clicks
    document.addEventListener("auxclick", (e) => {
      if (e.button === 1 || e.button === 2) {
        e.preventDefault();
      }
    });
  }, []);

  React.useEffect(() => {
    const preventBack = () => {
      window.history.pushState(null, "", window.location.href);
    };
    window.addEventListener("popstate", preventBack);
    window.history.pushState(null, "", window.location.href);
    return () => {
      window.removeEventListener("popstate", preventBack);
    };
  }, []);

  const noNavRoutes = ["/"];
  const shouldShowNavAndHeader = !noNavRoutes.includes(location.pathname);

  return JSX.jsxs("div", {
    className: Wo.appContainer,
    children: [
      shouldShowNavAndHeader &&
        JSX.jsx("div", {
          className: Wo.containerNavigation,
          children: JSX.jsx(NavigationView, {}),
        }),
      JSX.jsxs("div", {
        className: Wo.containerContent,
        children: [
          shouldShowNavAndHeader &&
            JSX.jsx(React.Fragment, { children: JSX.jsx(HeaderView, {}) }),
          JSX.jsx(React.Fragment, {
            children: JSX.jsxs(
              Routes,
              {
                location: location,
                children: [
                  JSX.jsx(Route, {
                    path: "/",
                    element: JSX.jsx(RouteTransition, { children: JSX.jsx(AuthorizationView, {}) }),
                  }),
                  JSX.jsx(Route, {
                    path: "/home",
                    element: JSX.jsx(RouteTransition, { children: JSX.jsx(HomeView, {}) }),
                  }),
                  JSX.jsx(Route, {
                    path: "/settings",
                    element: JSX.jsx(RouteTransition, { children: JSX.jsx(SettingsView, {}) }),
                  }),
                ],
              },
              location.pathname
            ),
          }),
        ],
      }),
    ],
  });
};

const App = () => {
  return JSX.jsx(AppBackground, {
    children: JSX.jsx(NotificationProvider, { children: JSX.jsx(AppLayout, {}) }),
  });
};

// ==========================================
// SECTION: App Bootstrap / Entrypoint
// ==========================================

// Drag and drop window controls (Native bridge)
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

document.addEventListener("mousedown", function (e) {
  if (e.button !== 0) return;
  const target = e.target;
  const isInteractive =
    target.closest("input") ||
    target.closest("button") ||
    target.closest("a") ||
    target.closest("i") ||
    target.closest("#catch");

  if (!isInteractive) {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    window.chrome.webview.postMessage(
      JSON.stringify({ type: "start_drag", x: dragStartX, y: dragStartY })
    );
  }
});

document.addEventListener("mousemove", function (e) {
  if (isDragging) {
    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;
    window.chrome.webview.postMessage(
      JSON.stringify({ type: "dragging", deltaX: deltaX, deltaY: deltaY })
    );
    dragStartX = e.clientX;
    dragStartY = e.clientY;
  }
});

document.addEventListener("mouseup", function () {
  if (isDragging) {
    isDragging = false;
    window.chrome.webview.postMessage(
      JSON.stringify({ type: "end_drag" })
    );
  }
});

// Initialize AOS & Render React App
const aosLib = JX();
const aosInstance = _V(aosLib);

LauncherController.sendActionMessage("INITIALIZE_LAUNCHER", {});
LauncherController.sendActionMessage("TRYING_AUTHORIZATION", {});
aosInstance.init({ offset: 0, once: false });

document.documentElement.style.zoom = (1 / window.devicePixelRatio).toString();

G1.createRoot(document.getElementById("root")).render(
  JSX.jsx(Router, { children: JSX.jsx(App, {}) })
);
