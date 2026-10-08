import { api } from "./api.js";
import { esc, labels } from "./utils.js";

let active = 0;
export function heroCarousel(welcome) {
  return `<section class="hero-carousel" aria-label="校园看板" aria-roledescription="轮播" tabindex="0">
    <div class="hero-track">
      <div class="hero-slide" role="group" aria-roledescription="幻灯片" aria-label="1 / 2 欢迎">${welcome}</div>
      <div class="hero-slide ranking-slide" role="group" aria-roledescription="幻灯片" aria-label="2 / 2 校园掉装备榜">
        <div class="ranking-heading"><div><span class="ranking-kicker">CAMPUS MONTHLY</span><h2>校园装备风云榜</h2></div><span class="ranking-period">本月</span></div>
        <div class="ranking-content" aria-live="polite"><p>正在统计本月寻物信息…</p></div>
      </div>
    </div>
    <div class="hero-floating"><button type="button" data-hero-step="-1" aria-label="上一张看板">‹</button><button type="button" data-hero-step="1" aria-label="下一张看板">›</button></div>
  </section>`;
}
export function mountHero(campusId, campusName) {
  const root = document.querySelector(".hero-carousel");
  if (!root) return;
  const track = root.querySelector(".hero-track");
  const mark = () => {
    root.dataset.active = String(active);
  };
  const go = (index) => {
    active = (index + 2) % 2;
    mark();
    track.scrollTo({
      left: active * track.clientWidth,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };
  track.scrollLeft = active * track.clientWidth;
  mark();
  track.addEventListener(
    "scroll",
    () => {
      active = Math.round(track.scrollLeft / track.clientWidth);
      mark();
    },
    { passive: true },
  );
  root.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-hero-page]"),
      arrow = event.target.closest("[data-hero-step]");
    if (tab) go(Number(tab.dataset.heroPage));
    if (arrow) go(active + Number(arrow.dataset.heroStep));
  });
  root.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      go(active + (event.key === "ArrowLeft" ? -1 : 1));
    }
  });
  const content = root.querySelector(".ranking-content");
  async function load() {
    content.innerHTML = '<p class="ranking-empty">正在统计本月寻物信息…</p>';
    try {
      const result = await api(
        "/api/rankings/lost-categories?" +
          new URLSearchParams({ campus_id: campusId }),
      );
      if (!root.isConnected) return;
      root.querySelector(".ranking-period").textContent =
        result.month.replace("-", "年") + "月";
      content.innerHTML = `<div class="podium-grid">${result.boards
        .map(
          (board) =>
            `<article class="podium-card" data-board="${board.id}"><h3>${esc(board.title)}</h3><p class="podium-subtitle">${esc(board.subtitle)}</p><div class="podium">${[
              1, 0, 2,
            ]
              .map((index) => {
                const item = board.items[index],
                  name = item
                    ? board.category
                      ? labels[item.name]
                      : item.name
                    : "虚位以待";
                return `<div class="podium-place place-${index + 1} ${item ? "" : "vacant"}"><div class="podium-label"><span class="podium-medal">${["♛", "②", "③"][index]}</span><strong title="${esc(name)}">${esc(name)}</strong><span>${item ? `${item.count}<small>${board.unit}</small>` : "—"}</span>${item?.sample ? `<small>样本 ${item.sample} 条</small>` : ""}</div><div class="podium-step"><b>${index + 1}</b></div></div>`;
              })
              .join(
                "",
              )}</div><p class="podium-note">${esc(board.note)}</p>${board.items.length ? "" : '<span class="podium-empty">本月暂无记录</span>'}</article>`,
        )
        .join(
          "",
        )}</div><p class="ranking-scope">${esc(campusName || "全部校区")} · 按本月事发日期统计 · 仅本平台记录 · 不含已删除</p>`;
    } catch {
      if (!root.isConnected) return;
      content.innerHTML =
        '<div class="ranking-empty"><span>榜单暂时加载失败</span><button type="button" class="ranking-retry">重新加载</button></div>';
      content.querySelector("button").onclick = load;
    }
  }
  load();
}
