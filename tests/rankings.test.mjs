import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { RankingService } from "../backend/services/rankings.mjs";
import { today } from "../backend/lib/validation.mjs";

test("rankings aggregate current-month LOST posts, include ended posts, exclude deleted and other months; campus filters and ties are deterministic", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "CREATE TABLE campuses(id TEXT); CREATE TABLE posts(type TEXT,category TEXT,event_date TEXT,status TEXT,deleted_at TEXT,campus_id TEXT,location TEXT DEFAULT '图书馆');",
    );
    db.exec("INSERT INTO campuses VALUES('xiasha'),('other');");
    const insert = db.prepare(
      "INSERT INTO posts(type,category,event_date,status,deleted_at,campus_id) VALUES(?,?,?,?,?,?)",
    );
    const date = today(),
      old = "2000-01-01";
    for (const status of ["OPEN", "RESOLVED", "CLOSED"])
      insert.run("LOST", "CARD", date, status, null, "xiasha");
    insert.run("LOST", "KEY", date, "OPEN", null, "other");
    insert.run("LOST", "BOOK", date, "OPEN", null, "other");
    insert.run("LOST", "CARD", date, "OPEN", date, "xiasha");
    insert.run("FOUND", "CARD", date, "OPEN", null, "xiasha");
    insert.run("LOST", "CARD", old, "OPEN", null, "xiasha");
    insert.run("FOUND", "KEY", date, "RESOLVED", null, "xiasha");
    const service = new RankingService(db);
    const all = service.lostCategories(new URLSearchParams());
    assert.equal(all.total, 5);
    assert.equal(all.boards.length, 4);
    assert.deepEqual(all.boards[1].items, [{ name: "KEY", count: 1 }]);
    assert.equal(all.boards[2].items[0].count, 5);
    assert.equal(
      all.boards[3].items.find((x) => x.name === "CARD").count,
      66.7,
    );
    assert.deepEqual(
      all.items.map((x) => [x.category, x.count, x.percentage]),
      [
        ["CARD", 3, 60],
        ["BOOK", 1, 20],
        ["KEY", 1, 20],
      ],
    );
    assert.equal(
      service.lostCategories(new URLSearchParams("campus_id=xiasha")).total,
      3,
    );
    assert.throws(
      () => service.lostCategories(new URLSearchParams("campus_id=missing")),
      (e) => e.status === 400,
    );
    db.exec("DELETE FROM posts");
    assert.deepEqual(service.lostCategories(new URLSearchParams()).items, []);
    assert.equal(service.lostCategories(new URLSearchParams()).total, 0);
  } finally {
    db.close();
  }
});
