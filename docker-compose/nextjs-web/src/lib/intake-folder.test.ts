/**
 * intake-folder.test.ts — 注文書取込フォルダ（SY0C）の読み書き。
 *
 * 実ファイルを触る唯一の業務モジュールなので、テストも本物の一時ディレクトリで
 * 動かす。守りたいのは 2 点:
 *   - 投入したファイルが**取込待ちとして見える**こと（ポーラーが拾える名前）
 *   - 外から来た名前でフォルダの外に出られないこと（`../` / 別ディレクトリ）
 */

import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isIntakeFile,
  readIntakeFolder,
  retryFailedIntake,
  saveToIntakeFolder,
} from "./intake-folder";

let dir: string;
const originalDir = process.env.INTAKE_DIR;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "intake-test-"));
  process.env.INTAKE_DIR = dir;
});

afterEach(() => {
  if (originalDir === undefined) delete process.env.INTAKE_DIR;
  else process.env.INTAKE_DIR = originalDir;
});

describe("isIntakeFile", () => {
  it("取込対象の拡張子だけ通す（大文字も）", () => {
    expect(isIntakeFile("注文書.pdf")).toBe(true);
    expect(isIntakeFile("注文書.PDF")).toBe(true);
    expect(isIntakeFile("scan.jpeg")).toBe(true);
    expect(isIntakeFile("メモ.txt")).toBe(false);
    expect(isIntakeFile("拡張子なし")).toBe(false);
  });
});

describe("readIntakeFolder", () => {
  it("INTAKE_DIR 未設定なら configured=false（例外にしない）", async () => {
    delete process.env.INTAKE_DIR;
    const status = await readIntakeFolder();
    expect(status.configured).toBe(false);
    expect(status.readable).toBe(false);
    expect(status.pending).toEqual([]);
  });

  it("設定済みでも実体が無ければ readable=false + 理由", async () => {
    process.env.INTAKE_DIR = path.join(dir, "missing");
    const status = await readIntakeFolder();
    expect(status.configured).toBe(true);
    expect(status.readable).toBe(false);
    expect(status.error).toContain("読めません");
  });

  it("待ち / 処理中 / 取込済 / 失敗 を分けて数える", async () => {
    await writeFile(path.join(dir, "a.pdf"), "a");
    await writeFile(path.join(dir, "b.png"), "b");
    await writeFile(path.join(dir, "メモ.txt"), "x"); // 対象外
    await writeFile(path.join(dir, "c.pdf.processing"), "c");
    await mkdir(path.join(dir, "processed"), { recursive: true });
    await writeFile(path.join(dir, "processed", "done.pdf"), "d");
    await mkdir(path.join(dir, "failed"), { recursive: true });
    await writeFile(path.join(dir, "failed", "bad.pdf"), "e");

    const status = await readIntakeFolder();
    expect(status.readable).toBe(true);
    expect(status.pending.map((e) => e.name).sort()).toEqual([
      "a.pdf",
      "b.png",
    ]);
    expect(status.processing.map((e) => e.name)).toEqual(["c.pdf.processing"]);
    expect(status.processedTotal).toBe(1);
    expect(status.failedTotal).toBe(1);
  });
});

describe("saveToIntakeFolder", () => {
  it("投入したファイルが取込待ちに並ぶ（元の名前が残る）", async () => {
    const name = await saveToIntakeFolder({
      filename: "注文書-1.pdf",
      bytes: Buffer.from("%PDF-1.4"),
    });
    expect(name).toContain("注文書-1.pdf");
    const status = await readIntakeFolder();
    expect(status.pending.map((e) => e.name)).toEqual([name]);
  });

  it("同名を二度投入しても上書きしない", async () => {
    const a = await saveToIntakeFolder({
      filename: "同じ.pdf",
      bytes: Buffer.from("1"),
    });
    const b = await saveToIntakeFolder({
      filename: "同じ.pdf",
      bytes: Buffer.from("2"),
    });
    expect(a).not.toBe(b);
    const status = await readIntakeFolder();
    expect(status.pending).toHaveLength(2);
  });

  it("書き込み途中の .part を残さない", async () => {
    await saveToIntakeFolder({
      filename: "注文書.pdf",
      bytes: Buffer.from("x"),
    });
    const names = await readdir(dir);
    expect(names.some((n) => n.endsWith(".part"))).toBe(false);
  });

  it("パス区切りを含む名前でもフォルダの外へ出さない", async () => {
    const name = await saveToIntakeFolder({
      filename: "../../etc/passwd.pdf",
      bytes: Buffer.from("x"),
    });
    expect(name).not.toContain("/");
    expect(name).toContain("passwd.pdf");
    const status = await readIntakeFolder();
    expect(status.pending.map((e) => e.name)).toEqual([name]);
  });

  it("対象外の拡張子は弾く", async () => {
    await expect(
      saveToIntakeFolder({ filename: "script.sh", bytes: Buffer.from("x") }),
    ).rejects.toThrow("対応していない");
  });
});

describe("retryFailedIntake", () => {
  it("failed/ の 1 件を待ちへ戻す（名前は維持）", async () => {
    await mkdir(path.join(dir, "failed"), { recursive: true });
    await writeFile(
      path.join(dir, "failed", "ORD-202608-00003-注文書.pdf"),
      "x",
    );

    const moved = await retryFailedIntake("ORD-202608-00003-注文書.pdf");
    expect(moved).toBe("ORD-202608-00003-注文書.pdf");

    const status = await readIntakeFolder();
    expect(status.pending.map((e) => e.name)).toEqual([moved]);
    expect(status.failedTotal).toBe(0);
  });

  it("空白入りのファイル名でもそのまま戻せる", async () => {
    await mkdir(path.join(dir, "failed"), { recursive: true });
    await writeFile(path.join(dir, "failed", "注文書 5.pdf"), "x");
    const moved = await retryFailedIntake("注文書 5.pdf");
    expect(moved).toBe("注文書 5.pdf");
  });

  it("待ちに同名があるときは一意化して戻す", async () => {
    await writeFile(path.join(dir, "重複.pdf"), "pending");
    await mkdir(path.join(dir, "failed"), { recursive: true });
    await writeFile(path.join(dir, "failed", "重複.pdf"), "failed");

    const moved = await retryFailedIntake("重複.pdf");
    expect(moved).not.toBe("重複.pdf");
    expect(moved).toContain("重複.pdf");
    const status = await readIntakeFolder();
    expect(status.pending).toHaveLength(2);
  });

  it("フォルダ外を指す名前は拒否する", async () => {
    await writeFile(path.join(dir, "outside.pdf"), "x");
    // basename で失敗フォルダ直下に閉じ込めるので、待ちのファイルは動かない。
    await expect(retryFailedIntake("../outside.pdf")).rejects.toThrow(
      "見つかりません",
    );
    const status = await readIntakeFolder();
    expect(status.pending.map((e) => e.name)).toEqual(["outside.pdf"]);
  });

  it("対象外の拡張子は拒否する", async () => {
    await expect(retryFailedIntake("script.sh")).rejects.toThrow("不正");
  });
});
