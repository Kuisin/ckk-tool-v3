package jp.co.ckk.kiosk

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
 *   getPublicKey(): SPKI DER base64
 *   sign(data):     SHA256withECDSA の DER 署名 base64
 */
class KioskBridge {

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
}
