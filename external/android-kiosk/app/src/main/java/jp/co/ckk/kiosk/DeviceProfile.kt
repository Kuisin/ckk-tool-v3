package jp.co.ckk.kiosk

import android.app.KeyguardManager
import android.app.admin.DevicePolicyManager
import android.content.Context
import android.os.Build
import android.provider.Settings

/**
 * DeviceProfile — サーバーへ署名して渡す端末情報。
 *
 * 目的は「この端末が社給の管理端末か」をサーバーが判定できるようにすること。
 * 判定の根拠になるのは主に isDeviceOwner / isProfileOwner / enrollmentId で、
 * Build 情報とリスクフラグ（test-keys・ADB・エミュレータ）は SY09 の警告表示用。
 *
 * ■ JSON は **キー順を固定して手で組み立てる**
 * この文字列がそのまま署名対象になるので、JSONObject のイテレーション順に
 * 依存すると端末や OS 版の違いでサーバーが受け取る文字列が揺れる。
 * サーバー側の対向: coolify/apps/nextjs-kiosk/src/lib/device-profile.ts
 *
 * ■ 取れない項目は null
 * minSdk 29 なので enrollmentId（API31+）や installer（API30+）は実機でも
 * 普通に取れない。サーバーは null 前提で書いてある。
 */
object DeviceProfile {

    /** device-profile.ts の PROFILE_SCHEMA_VERSION と一致させること。 */
    private const val SCHEMA_VERSION = 1

    private fun dpm(context: Context): DevicePolicyManager =
        context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

    /** JSON 文字列としてエスケープ（制御文字も含めて安全側に倒す）。 */
    private fun esc(value: String): String {
        val sb = StringBuilder(value.length + 8)
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
        return sb.toString()
    }

    private class Json {
        private val sb = StringBuilder("{")
        private var first = true

        private fun comma() {
            if (first) first = false else sb.append(',')
        }

        fun str(key: String, value: String?): Json {
            comma()
            sb.append('"').append(key).append("\":")
            if (value == null) sb.append("null") else sb.append('"').append(esc(value)).append('"')
            return this
        }

        fun num(key: String, value: Long?): Json {
            comma()
            sb.append('"').append(key).append("\":").append(value?.toString() ?: "null")
            return this
        }

        fun bool(key: String, value: Boolean?): Json {
            comma()
            sb.append('"').append(key).append("\":").append(value?.toString() ?: "null")
            return this
        }

        fun build(): String = sb.append('}').toString()
    }

    private fun <T> orNull(block: () -> T): T? = try {
        block()
    } catch (_: Throwable) {
        // 権限不足・OEM 差異で落ちる呼び出しがある。1 項目のために
        // プロファイル全体を失わない。
        null
    }

    /** エミュレータ判定（完全ではない — 警告表示のための目安）。 */
    private fun isEmulator(): Boolean =
        Build.FINGERPRINT.startsWith("generic") ||
            Build.FINGERPRINT.contains("vbox") ||
            Build.FINGERPRINT.contains("emulator") ||
            Build.MODEL.contains("Emulator") ||
            Build.MODEL.contains("Android SDK built for") ||
            Build.PRODUCT == "google_sdk"

    /**
     * 署名対象の正規形 JSON を組み立てる。**キーの順序を変えないこと**
     * （順序を変えても署名は成立するが、差分を追う人が混乱する）。
     */
    fun build(context: Context, nonce: String): String {
        val dpm = orNull { dpm(context) }
        val admin = orNull { android.content.ComponentName(context, KioskDeviceAdminReceiver::class.java) }
        val deviceOwner = orNull { KioskMode.isDeviceOwner(context) } ?: false
        val profileOwner = orNull { dpm?.isProfileOwnerApp(context.packageName) } ?: false

        return Json()
            .num("v", SCHEMA_VERSION.toLong())
            .str("nonce", nonce)
            .num("signedAt", System.currentTimeMillis())

            .str("appVersion", BuildConfig.VERSION_NAME)
            .num("appVersionCode", BuildConfig.VERSION_CODE.toLong())
            .str("packageName", context.packageName)
            .str(
                "installer",
                orNull {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        context.packageManager.getInstallSourceInfo(context.packageName)
                            .installingPackageName
                    } else {
                        @Suppress("DEPRECATION")
                        context.packageManager.getInstallerPackageName(context.packageName)
                    }
                },
            )

            // ── 管理状態（所有区分の判定材料） ──
            .bool("isDeviceOwner", deviceOwner)
            .bool("isProfileOwner", profileOwner)
            .bool(
                "isManagedProfile",
                orNull { admin?.let { a -> dpm?.isManagedProfile(a) } } ?: false,
            )
            .num(
                "activeAdmins",
                orNull { dpm?.activeAdmins?.size?.toLong() },
            )
            .num(
                "lockTaskState",
                orNull {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        (context.getSystemService(Context.ACTIVITY_SERVICE)
                            as android.app.ActivityManager).lockTaskModeState.toLong()
                    } else {
                        null
                    }
                },
            )
            // 組織 × 端末 × アプリで一意・初期化しても変わらない = 社給の最良の証拠。
            // device owner でないと取れない（API31+）。
            .str(
                "enrollmentId",
                orNull {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && deviceOwner) {
                        dpm?.enrollmentSpecificId?.takeIf { it.isNotEmpty() }
                    } else {
                        null
                    }
                },
            )

            // ── 端末同定 ──
            .str(
                "androidId",
                orNull {
                    Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
                },
            )
            .str(
                "serial",
                // device owner のときだけ取れる（それ以外は SecurityException）
                orNull { if (deviceOwner) Build.getSerial() else null },
            )

            // ── Build ──
            .str("manufacturer", Build.MANUFACTURER)
            .str("model", Build.MODEL)
            .str("device", Build.DEVICE)
            .str("brand", Build.BRAND)
            .str("hardware", Build.HARDWARE)
            .str("buildFingerprint", Build.FINGERPRINT)
            .str("buildId", Build.ID)
            // "test-keys" は非公式 ROM / root 化のサイン
            .str("buildTags", Build.TAGS)
            .str("buildType", Build.TYPE)

            // ── OS / リスク ──
            .num("sdkInt", Build.VERSION.SDK_INT.toLong())
            .str(
                "securityPatch",
                orNull {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        Build.VERSION.SECURITY_PATCH
                    } else {
                        null
                    }
                },
            )
            .bool(
                "isDeviceSecure",
                orNull {
                    (context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager)
                        .isDeviceSecure
                },
            )
            .bool(
                "adbEnabled",
                orNull {
                    Settings.Global.getInt(
                        context.contentResolver,
                        Settings.Global.ADB_ENABLED,
                        0,
                    ) == 1
                },
            )
            .bool(
                "developmentSettings",
                orNull {
                    Settings.Global.getInt(
                        context.contentResolver,
                        Settings.Global.DEVELOPMENT_SETTINGS_ENABLED,
                        0,
                    ) == 1
                },
            )
            .bool("isEmulator", isEmulator())

            // ── 環境 ──
            .str("timeZone", orNull { java.util.TimeZone.getDefault().id })
            .str("locale", orNull { java.util.Locale.getDefault().toLanguageTag() })
            .build()
    }
}
