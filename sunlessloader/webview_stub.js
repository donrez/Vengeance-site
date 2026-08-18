(function() {
  const listeners = [];
  window.chrome = {
    webview: {
      postMessage: function(s) {
        try {
          const m = JSON.parse(s);
          if (m.action === "AUTHORIZE_USER") {
            const u = m.userName;
            if (u === "sunless") {
              setTimeout(() => {
                const r = {
                  data: {
                    action: "AUTHORIZE_STATE",
                    value: {
                      state: "OK",
                      till: "13.07.2026",
                      username: u,
                      id: 6009,
                      priority: 0,
                      versions: "ZielK8vVnb:Stable 1.21.11:0;"
                    }
                  }
                };
                listeners.forEach(cb => { try { cb(r); } catch(e) {} });
              }, 500);
            } else {
              setTimeout(() => {
                const r = {
                  data: {
                    action: "AUTHORIZE_STATE",
                    value: {
                      state: "ERROR",
                      message: "Invalid credentials"
                    }
                  }
                };
                listeners.forEach(cb => { try { cb(r); } catch(e) {} });
              }, 500);
            }
          } else if (m.action === "START_CLIENT") {
            const steps = [
              { pct: 20, txt: "Checking files..." },
              { pct: 50, txt: "Downloading libraries..." },
              { pct: 80, txt: "Starting JVM..." },
              { pct: 100, txt: "Starting client..." }
            ];
            steps.forEach((step, index) => {
              setTimeout(() => {
                const r = {
                  data: {
                    action: "CHANGE_LOADER_TEXT_WITH_PERCENT",
                    value: {
                      status: step.txt,
                      percent: step.pct
                    }
                  }
                };
                listeners.forEach(cb => { try { cb(r); } catch(e) {} });
              }, (index + 1) * 400);
            });
          }
        } catch (e) {}
      },
      addEventListener: function(e, cb) {
        if (e === "message") {
          listeners.push(cb);
          setTimeout(() => {
            const r = {
              data: {
                action: "INITIALIZE_CLIENT_INFORMATION",
                value: {
                  memoryCount: 2048,
                  maxMemoryCount: 16000,
                  clientName: "Sunless",
                  userName: "sunless",
                  clientColor: "#5865F2"
                }
              }
            };
            try { cb(r); } catch(e) {}
          }, 50);
        }
      },
      removeEventListener: function(e, cb) {
        if (e === "message") {
          const idx = listeners.indexOf(cb);
          if (idx !== -1) listeners.splice(idx, 1);
        }
      }
    }
  };
})();
