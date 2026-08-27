/**
 * design-file-kind.ts — 設計ファイルを「どう見せるか」に振り分ける（純関数）。
 *
 * 判定は**拡張子が正**。ブラウザが付ける MIME は 3D 形式でほぼ当てにならず
 * （STL が application/octet-stream で来る等）、保存側でも拡張子から正規化して
 * いるため。MIME は拡張子が読めなかったときの保険にだけ使う。
 *
 * サーバー（配信の inline 可否）とクライアント（ビューアの出し分け）が同じ
 * 判定を使えるよう、I/O を持たないここに置く。
 */

/** 画面での見せ方。 */
export type DesignFileKind =
  | "pdf"
  | "image"
  | "model3d"
  /** 見せる手段が無い（表計算・圧縮・CAD 2D など）— ダウンロードのみ。 */
  | "download";

/**
 * online-3d-viewer が**追加ライブラリ無しで**読める形式。
 *
 * npm の `online-3d-viewer` はエンジンだけを同梱していて、STEP / IGES / BREP
 * （occt-import-js）・3DM（rhino3dm）・IFC（web-ifc）・Draco 圧縮 glTF が要る
 * wasm は入っていない。それらを public/ へ持ち込むかは別の判断なので、
 * **ここには入れない** — 読めないものを「見られます」と出す方が害が大きい。
 */
const MODEL_3D_EXT = new Set([
  "stl",
  "obj",
  "ply",
  "3ds",
  "off",
  "dae",
  "wrl",
  "gltf",
  "glb",
  "3mf",
  "amf",
  "fbx",
]);

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"]);

/** ファイル名の拡張子（小文字・ドット無し）。無ければ空文字。 */
export function fileExtension(filename: string): string {
  const i = filename.lastIndexOf(".");
  if (i < 0 || i === filename.length - 1) return "";
  return filename.slice(i + 1).toLowerCase();
}

/**
 * 見せ方を決める。拡張子が最優先で、読めないときだけ MIME を見る。
 *
 * ⚠️ HEIC は**画像だが Chrome / Firefox が描けない**ので image にしない
 * （壊れた img を出すより、ダウンロードさせる方が親切）。
 */
export function designFileKind(
  filename: string,
  mimeType?: string | null,
): DesignFileKind {
  const ext = fileExtension(filename);
  if (ext === "pdf") return "pdf";
  if (IMAGE_EXT.has(ext)) return "image";
  if (MODEL_3D_EXT.has(ext)) return "model3d";
  if (ext) return "download";

  // 拡張子が無いときだけ MIME で拾う。
  const mime = (mimeType ?? "").toLowerCase();
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/png" || mime === "image/jpeg" || mime === "image/webp") {
    return "image";
  }
  return "download";
}

/** ブラウザ内で開けるか（サムネイル・ビューアを出す価値があるか）。 */
export function isViewable(filename: string, mimeType?: string | null) {
  return designFileKind(filename, mimeType) !== "download";
}

/** ダウンロードのみになる理由（利用者に出す文言）。 */
export function notViewableReason(filename: string): string {
  const ext = fileExtension(filename);
  // 読めそうに見えて読めないものは、なぜダメかを言う。
  if (["step", "stp", "iges", "igs", "brep", "3dm", "ifc"].includes(ext)) {
    return `${ext.toUpperCase()} はこの画面では表示できません（ダウンロードしてご覧ください）`;
  }
  if (ext === "dxf" || ext === "dwg") {
    return `${ext.toUpperCase()} はこの画面では表示できません（ダウンロードしてご覧ください）`;
  }
  if (ext === "heic") {
    return "HEIC はブラウザによっては表示できないため、ダウンロードしてご覧ください";
  }
  return "この形式は表示できません（ダウンロードしてご覧ください）";
}
