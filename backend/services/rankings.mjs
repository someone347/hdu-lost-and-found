import { invariant } from "../lib/errors.mjs";
import { today } from "../lib/validation.mjs";

export class RankingService {
  constructor(db) {
    this.db = db;
  }
  lostCategories(query) {
    const campus = query.get("campus_id") || "";
    invariant(
      !campus ||
        this.db.prepare("SELECT id FROM campuses WHERE id=?").get(campus),
      400,
      "校区不存在",
    );
    const month = today().slice(0, 7);
    const start = month + "-01";
    const [year, number] = month.split("-").map(Number);
    const end =
      number === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(number + 1).padStart(2, "0")}-01`;
    const items = this.db
      .prepare(
        `SELECT category, COUNT(*) AS count FROM posts
      WHERE type='LOST' AND deleted_at IS NULL AND event_date>=? AND event_date<?
      ${campus ? "AND campus_id=?" : ""}
      GROUP BY category ORDER BY count DESC,category ASC`,
      )
      .all(start, end, ...(campus ? [campus] : []));
    const total = items.reduce((sum, item) => sum + item.count, 0);
    const rows = this.db
      .prepare(
        `SELECT type,category,location,status FROM posts WHERE deleted_at IS NULL AND event_date>=? AND event_date<? ${campus ? "AND campus_id=?" : ""}`,
      )
      .all(start, end, ...(campus ? [campus] : []));
    const grouped = (list, key) => {
      const counts = new Map();
      for (const row of list)
        counts.set(row[key], (counts.get(row[key]) || 0) + 1);
      return [...counts]
        .map(([name, count]) => ({ name, count }))
        .sort(
          (a, b) =>
            b.count - a.count ||
            (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
        )
        .slice(0, 3);
    };
    const lost = rows.filter((p) => p.type === "LOST");
    const rates = [...new Set(lost.map((p) => p.category))]
      .map((category) => {
        const group = lost.filter((p) => p.category === category),
          unresolved = group.filter((p) => p.status !== "RESOLVED").length;
        return {
          name: category,
          count: Math.round((unresolved / group.length) * 1000) / 10,
          sample: group.length,
        };
      })
      .sort(
        (a, b) =>
          b.count - a.count ||
          b.sample - a.sample ||
          (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
      )
      .slice(0, 3);
    return {
      month,
      campus_id: campus,
      total,
      items: items.map((item) => ({
        ...item,
        percentage: Math.round((item.count / total) * 1000) / 10,
      })),
      boards: [
        {
          id: "lost",
          title: "掉装备数量榜",
          subtitle: "哪些物品最常被寻找",
          unit: "条",
          category: true,
          items: grouped(lost, "category"),
          note: "本月寻物帖数量，含已找回与已关闭。",
        },
        {
          id: "returned",
          title: "拾金不昧榜",
          subtitle: "这些物品已回到主人身边",
          unit: "条",
          category: true,
          items: grouped(
            rows.filter((p) => p.type === "FOUND" && p.status === "RESOLVED"),
            "category",
          ),
          note: "按物品类别统计自报已归还招领帖，未经双方核实。",
        },
        {
          id: "places",
          title: "掉装备地点榜",
          subtitle: "路过这里，记得检查口袋",
          unit: "条",
          category: false,
          items: grouped(lost, "location"),
          note: "按帖子填写地点原文汇总，相近地点尚未合并。",
        },
        {
          id: "unresolved",
          title: "未找回占比榜",
          subtitle: "这些装备还在等待回音",
          unit: "%",
          category: true,
          items: rates,
          note: "未标记已找回 / 同类别寻物帖；含已关闭，非全校失踪率。",
        },
      ],
    };
  }
}
