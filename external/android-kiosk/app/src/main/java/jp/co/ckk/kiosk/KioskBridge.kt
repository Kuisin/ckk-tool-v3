package jp.co.ckk.kiosk

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.webkit.JavascriptInterface
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.spec.ECGenParameterSpec

/**
 * KioskBridge — WebView へ注入する `window.KioskDevice`。
 *
 * Android Keystore にハードウェア保護の P-256 鍵を生成（非エクスポート）。
 * サーバー側（nextjs-kiosk /api/kiosk/attest）は初回アテステーションで
 * 公開鍵を端末行に束縛（TOFU）し、以後この鍵の署名がないとアクセスできない
 * （KIOSK_ATTESTATION=required 時）。
 *
 * Web 側の対向実装: coolify/apps/nextjs-kiosk/src/lib/wrapper-bridge.ts
 *   getPublicKey():       SPKI DER base64
 *   sign(data):           SHA256withECDSA の DER 署名 base64
 *   deviceProfile(nonce): 署名済み端末プロファイル（v0.6.0+）
 *
 * @param context 端末プロファイル（管理状態・Build 情報）の収集に使う。
 */
class KioskBridge(private val context: Context) {

    private val alias = "kiosk-device-key"

    private fun keyStore(): KeyStore =
        KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    @Synchronized
    private fun ensureKey(ks: KeyStore) {
        if (ks.containsAlias(alias)) return
        val generator = KeyPairGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_EC,
            "AndroidKeyStore",
        )
        generator.initialize(
            KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
                .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256)
                // 共有端末: 個人の画面ロック解除は要求しない（鍵は端末に束縛）
                .setUserAuthenticationRequired(false)
                .build(),
        )
        generator.generateKeyPair()
    }

    /** SPKI DER base64（X.509 公開鍵）。 */
    @JavascriptInterface
    fun getPublicKey(): String {
        val ks = keyStore()
        ensureKey(ks)
        val publicKey = ks.getCertificate(alias).publicKey
        return Base64.encodeToString(publicKey.encoded, Base64.NO_WRAP)
    }

    /** SHA256withECDSA（DER）署名 base64。 */
    @JavascriptInterface
    fun sign(data: String): String {
        val ks = keyStore()
        ensureKey(ks)
        val entry = ks.getEntry(alias, null) as KeyStore.PrivateKeyEntry
        val signature = Signature.getInstance("SHA256withECDSA").apply {
            initSign(entry.privateKey)
            update(data.toByteArray(Charsets.UTF_8))
        }
        return Base64.encodeToString(signature.sign(), Base64.NO_WRAP)
    }

    /** ラッパーのバージョン（表示・デバッグ用）。 */
    @JavascriptInterface
    fun appVersion(): String = BuildConfig.VERSION_NAME

    /**
     * 署名済み端末プロファイル（v0.6.0+）。戻り値は JSON:
     *   {"profile":"<正規形 JSON>","signature":"<SHA256withECDSA DER base64>"}
     *
     * 署名対象は `"$nonce\n$profileJson"` — サーバー側 attestPayload
     * （nextjs-kiosk/src/lib/device-profile.ts）と **1 文字も違ってはいけない**。
     * サーバーは署名検証に成功してから profileJson を parse する。profile 内にも
     * nonce を入れてあるので、別チャレンジで得た署名の貼り替えも弾かれる。
     *
     * 鍵は非エクスポートの Keystore 鍵なので、プロファイルを書き換えれば署名が
     * 壊れる = 「この端末が申告した内容である」ことは保証される。ただし root 化
     * 端末が本物の鍵で嘘の値に署名することは防げない（ハードウェア鍵
     * アテステーションの領域 — 既存の TOFU 束縛を壊すため今回は未採用）。
     */
    @JavascriptInterface
    fun deviceProfile(nonce: String): String {
        val profile = DeviceProfile.build(context, nonce)
        val signature = sign(nonce + "\n" + profile)
        return "{\"profile\":" + quote(profile) + ",\"signature\":" + quote(signature) + "}"
    }

    /** JSON 文字列リテラルとして囲む（profile は入れ子の JSON 文字列になる）。 */
    private fun quote(value: String): String {
        val sb = StringBuilder(value.length + 16).append('"')
        for (ch in value) {
            when {
                ch == '"' -> sb.append("\\\"")
                ch == '\\' -> sb.append("\\\\")
                ch == '\n' -> sb.append("\\n")
                ch == '\r' -> sb.append("\\r")
                ch == '\t' -> sb.append("\\t")
                ch < ' ' -> sb.append(String.format("\\u%04x", ch.code))
                else -> sb.append(ch)
            }
        }
        return sb.append('"').toString()
    }
}
