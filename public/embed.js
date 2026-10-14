/*! CalendlyIsDead embed · Apache-2.0
 * Inline:        <div class="cid-inline" data-url="https://host/you/30min" style="height:700px"></div>
 * Popup widget:  CalendlyIsDead.initPopupWidget({ url, text: "Book time", color: "#0E7C66" })
 * Popup text:    <a href="#" data-cid-popup="https://host/you/30min">Book time</a>
 * Events:        window.addEventListener("message", e => e.data?.source === "calendlyisdead" && e.data.type === "booked")
 */
(function () {
  if (window.CalendlyIsDead) return;
  var css = ".cid-frame{width:100%;min-width:320px;height:100%;min-height:640px;border:0;display:block}" +
    ".cid-overlay{position:fixed;inset:0;background:rgba(20,33,29,.45);z-index:2147483646;display:flex;align-items:center;justify-content:center;font-family:'DM Sans',system-ui,sans-serif}" +
    ".cid-modal{background:#fff;border-radius:16px;width:min(1060px,94vw);height:min(760px,90vh);overflow:hidden;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.25)}" +
    ".cid-close{position:absolute;top:8px;right:10px;z-index:1;border:0;background:#fff;border-radius:999px;width:34px;height:34px;font-size:18px;cursor:pointer}" +
    ".cid-badge{position:fixed;right:20px;bottom:20px;z-index:2147483645;border:0;border-radius:999px;padding:14px 22px;color:#fff;font:600 15px 'DM Sans',system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.2)}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  function withEmbed(url, opts) {
    var u = new URL(url, location.href); u.searchParams.set("embed", "1");
    if (opts && opts.color) u.searchParams.set("primary", String(opts.color).replace("#", ""));
    if (opts && opts.prefill) { if (opts.prefill.name) u.searchParams.set("name", opts.prefill.name); if (opts.prefill.email) u.searchParams.set("email", opts.prefill.email); }
    return u.toString();
  }
  function frame(url, opts) {
    var f = document.createElement("iframe"); f.className = "cid-frame"; f.src = withEmbed(url, opts); f.title = "Schedule a meeting"; f.allow = "payment"; return f;
  }
  function initInline(o) {
    var el = typeof o.parentElement === "string" ? document.querySelector(o.parentElement) : o.parentElement;
    if (!el || el.querySelector(".cid-frame")) return; el.appendChild(frame(o.url, o));
  }
  function initPopup(o) {
    var ov = document.createElement("div"); ov.className = "cid-overlay"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "Schedule a meeting");
    var m = document.createElement("div"); m.className = "cid-modal";
    var x = document.createElement("button"); x.className = "cid-close"; x.setAttribute("aria-label", "Close"); x.textContent = "✕";
    function close() { ov.remove(); document.removeEventListener("keydown", esc); }
    function esc(e) { if (e.key === "Escape") close(); }
    x.onclick = close; ov.onclick = function (e) { if (e.target === ov) close(); }; document.addEventListener("keydown", esc);
    m.appendChild(x); m.appendChild(frame(o.url, o)); ov.appendChild(m); document.body.appendChild(ov);
    return { close: close };
  }
  function initPopupWidget(o) {
    var b = document.createElement("button"); b.className = "cid-badge"; b.textContent = o.text || "Schedule time with me";
    b.style.background = o.color || "#0E7C66"; if (o.textColor) b.style.color = o.textColor;
    b.onclick = function () { initPopup(o); }; document.body.appendChild(b); return b;
  }
  function scan() {
    document.querySelectorAll(".cid-inline[data-url]").forEach(function (el) { initInline({ url: el.getAttribute("data-url"), parentElement: el, color: el.getAttribute("data-color") }); });
    document.querySelectorAll("[data-cid-popup]").forEach(function (el) {
      if (el.__cid) return; el.__cid = 1;
      el.addEventListener("click", function (e) { e.preventDefault(); initPopup({ url: el.getAttribute("data-cid-popup"), color: el.getAttribute("data-color") }); });
    });
  }
  // inline frames grow to fit their content
  window.addEventListener("message", function (e) {
    var d = e.data; if (!d || d.source !== "calendlyisdead" || d.type !== "height") return;
    document.querySelectorAll(".cid-inline .cid-frame").forEach(function (f) { if (f.contentWindow === e.source) f.style.height = Math.max(640, d.height) + "px"; });
  });
  window.CalendlyIsDead = { initInline: initInline, initPopup: initPopup, initPopupWidget: initPopupWidget, scan: scan };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan); else scan();
})();
