/* Altcha proof-of-work widget as a drop-in replacement for Cloudflare Turnstile.
   Loaded BEFORE the app bundle: defines window.turnstile so the bundle skips
   loading the real Turnstile script. The rendered widget solves an Altcha
   challenge from our own API and exposes the payload via getResponse(). */
(function () {
  var registry = {};

  function makeWidget(el, opts) {
    var id = "altcha-w" + Math.random().toString(36).slice(2);
    var w = document.createElement("altcha-widget");
    w.setAttribute("challenge", "/api/altcha/challenge");
    w.setAttribute("hide-footer", "");
    w.style.width = "100%";
    w.style.maxWidth = "300px";
    w.style.margin = "0 auto";
    w.style.display = "block";
    (el && el.appendChild ? el : document.body).appendChild(w);
    registry[id] = { widget: w, opts: opts || {}, payload: "" };
    w.addEventListener("statechange", function (ev) {
      var d = ev && ev.detail;
      if (d && d.state === "verified") {
        if (d.payload) registry[id].payload = d.payload;
        var o = registry[id] && registry[id].opts;
        if (o && o.onSuccess) {
          try { o.onSuccess(d.payload, null); } catch (e) {}
        }
        if (o && o.callback) {
          try { o.callback(d.payload); } catch (e) {}
        }
      }
    });
    w.addEventListener("verified", function (ev) {
      var d = ev && ev.detail;
      if (d && d.payload) {
        registry[id].payload = d.payload;
        var o = registry[id] && registry[id].opts;
        if (o && o.onSuccess) {
          try { o.onSuccess(d.payload, null); } catch (e) {}
        }
        if (o && o.callback) {
          try { o.callback(d.payload); } catch (e) {}
        }
      }
    });
    return id;
  }

  window.turnstile = {
    render: function (el, opts) {
      return makeWidget(el, opts);
    },
    getResponse: function (id) {
      var e = registry[id];
      return (e && e.payload) || (e && e.widget && e.widget.value) || "";
    },
    remove: function (id) {
      var e = registry[id];
      if (e && e.widget && e.widget.parentNode) {
        e.widget.parentNode.removeChild(e.widget);
      }
      delete registry[id];
    },
    reset: function () {},
    ready: function (fn) {
      if (fn) {
        try { fn(); } catch (e) {}
      }
    },
  };
})();