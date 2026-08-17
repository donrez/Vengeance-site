(function () {
  "use strict";

  var LS_HWID = "xtz_hwid";

  function hash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    }
    return h.toString(16).toUpperCase().padStart(8, "0");
  }

  function collect() {
    var parts = [];
    try {
      parts.push(navigator.userAgent);
      parts.push(navigator.language);
      parts.push(navigator.hardwareConcurrency || "");
      parts.push(navigator.deviceMemory || "");
      parts.push(screen.width + "x" + screen.height + "x" + screen.colorDepth);
      parts.push(String(new Date().getTimezoneOffset()));
      parts.push(navigator.platform || "");
    } catch (e) {}

    try {
      var c = document.createElement("canvas");
      c.width = 220;
      c.height = 60;
      var ctx = c.getContext("2d");
      ctx.textBaseline = "top";
      ctx.font = "14px Arial";
      ctx.fillStyle = "#a164dd";
      ctx.fillRect(0, 0, 220, 60);
      ctx.fillStyle = "#ffffff";
      ctx.fillText("Vengeance HWID", 8, 20);
      ctx.fillStyle = "#000000";
      ctx.fillText("Vengeance HWID", 12, 24);
      parts.push(c.toDataURL());
    } catch (e) {}

    try {
      var gl = document.createElement("canvas").getContext("webgl");
      if (gl) parts.push(String(gl.getParameter(gl.RENDERER) || ""));
    } catch (e) {}

    try {
      var fonts = ["Arial", "Verdana", "Georgia", "Times New Roman", "Courier New"];
      for (var i = 0; i < fonts.length; i++) {
        parts.push(document.fonts.check("16px " + fonts[i]) ? "1" : "0");
      }
    } catch (e) {}

    return parts.join("|");
  }

  window.deviceHwid = function () {
    try {
      var saved = localStorage.getItem(LS_HWID);
      if (saved && saved.indexOf("HWID-") === 0) return saved;
      var hwid = "HWID-" + hash(collect());
      try {
        localStorage.setItem(LS_HWID, hwid);
      } catch (e) {}
      return hwid;
    } catch (e) {
      return "HWID-UNKNOWN";
    }
  };
})();