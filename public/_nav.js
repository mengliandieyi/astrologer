(() => {
  const path = window.location.pathname || "/";
  const active = (href) => (href === "/" ? path === "/" : path.startsWith(href));

  const mount = document.getElementById("topbar");
  if (!mount) return;

  mount.innerHTML = `
    <div class="topbar">
      <div class="brand">
        <div class="brand-mark"></div>
        <div>
          <div class="brand-name">知行馆</div>
          <div style="font-size:12px; color:#d8deff; margin-top:2px;">以证据为凭 · 以行动为要</div>
        </div>
      </div>
      <div class="nav">
        <a href="/" data-active="${active("/") ? "true" : "false"}">工作台</a>
        <a href="/bazi" data-active="${active("/bazi") ? "true" : "false"}">八字</a>
        <a href="/stocks" data-active="${active("/stocks") ? "true" : "false"}">资产研究</a>
        <a href="/travel" data-active="${active("/travel") ? "true" : "false"}">旅行</a>
        <a href="/comic" data-active="${active("/comic") ? "true" : "false"}">漫剧</a>
      </div>
    </div>
  `;
})();
