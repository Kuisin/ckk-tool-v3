/**
 * server-only-stub.ts — vitest 用の `server-only` 置き換え（vitest.config.ts の alias）。
 *
 * `import "server-only"` は Next のバンドラが解決する印であって実体のある依存では
 * ないため、vitest から server-only なモジュール（lib/intake-folder など）を
 * import すると「Cannot find package 'server-only'」で落ちる。テストでは何も
 * しない空モジュールに差し替える — 本番の境界（クライアントから import したら
 * ビルドエラー）はビルド側で変わらず効く。
 */

export {};
