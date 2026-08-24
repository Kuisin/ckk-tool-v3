package jp.co.ckk.kiosk

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.BatteryManager
import android.provider.Settings

/**
 * KioskMode — デバイスオーナー時の専用端末（Lock Task）ポリシー。
 *
 * このアプリがデバイスオーナーのとき:
 * - Lock Task 許可リストにこのアプリだけを登録（ホーム/最近/通知での離脱不可）
 * - HomeActivity エイリアスを有効化し、ホーム（起動時・ホームボタン）を
 *   このアプリへ固定 → 再起動しても自動でキオスクに戻る
 * - ロック画面とステータスバーを無効化（プルダウンでの離脱防止）
 * - 給電中は画面を消さない
 *
 * デバイスオーナーでない通常インストールでは全メソッドが no-op。
 */
object KioskMode {

    private const val HOME_ALIAS = "jp.co.ckk.kiosk.HomeActivity"

    // WebView（QR ログイン・位置報告）が使う実行時権限。Lock Task 中は権限
    // ダイアログが表示されない（自動拒否される）ため、デバイスオーナー権限で
    // 事前に確定付与する。
    private val RUNTIME_PERMISSIONS = arrayOf(
        Manifest.permission.CAMERA,
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
    )

    private fun dpm(context: Context): DevicePolicyManager =
        context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

    private fun admin(context: Context): ComponentName =
        ComponentName(context, KioskDeviceAdminReceiver::class.java)

    fun isDeviceOwner(context: Context): Boolean =
        dpm(context).isDeviceOwnerApp(context.packageName)

    /** キオスク端末ポリシーを適用（冪等 — 何度呼んでも安全）。 */
    fun applyPolicies(context: Context) {
        if (!isDeviceOwner(context)) return
        val dpm = dpm(context)
        val admin = admin(context)
        val pkg = context.packageName

        // Lock Task はこのアプリのみ。電源メニューだけは許可（電源断は物理で
        // 可能なため隠しても意味がなく、正規の再起動手段を残す）
        dpm.setLockTaskPackages(admin, arrayOf(pkg))
        dpm.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS)

        // ホームをこのアプリへ固定（再起動後の自動起動）
        val home = ComponentName(pkg, HOME_ALIAS)
        context.packageManager.setComponentEnabledSetting(
            home,
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP,
        )
        val homeFilter = IntentFilter(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            addCategory(Intent.CATEGORY_DEFAULT)
        }
        dpm.addPersistentPreferredActivity(admin, homeFilter, home)

        // ロック画面・ステータスバー無効
        dpm.setKeyguardDisabled(admin, true)
        dpm.setStatusBarDisabled(admin, true)

        // カメラ・位置を自己付与（アプリ再セットアップで権限が消えても復元）
        for (permission in RUNTIME_PERMISSIONS) {
            dpm.setPermissionGrantState(
                admin,
                pkg,
                permission,
                DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED,
            )
        }

        // 給電中は画面常時 ON（アプリ内の FLAG_KEEP_SCREEN_ON に加えた保険）
        dpm.setGlobalSetting(
            admin,
            Settings.Global.STAY_ON_WHILE_PLUGGED_IN,
            (
                BatteryManager.BATTERY_PLUGGED_AC
                    or BatteryManager.BATTERY_PLUGGED_USB
                    or BatteryManager.BATTERY_PLUGGED_WIRELESS
                ).toString(),
        )
    }

    /**
     * 社内 CA を端末へインストールする（デバイスオーナー権限）。
     *
     * 社内 LAN のキオスク URL（`*.ckk-tools.loc`）は公開 TLD ではないため公的 CA の
     * 証明書が取れず、社内 CA 発行の証明書を使う。targetSdk 24 以降のアプリは
     * ユーザー領域の CA を既定では信頼しないので、`network_security_config.xml` で
     * **その 2 ホストに限って** user ストアを信頼するようにしてある。
     *
     * CA は **プロビジョニング QR の admin extras** で運ばれる（アプリに同梱しない）。
     * ネットワーク越しに取りに行かないのは、その経路自体がまだ検証できないため —
     * 攻撃者に差し替えられた CA を入れると全通信が覗かれる。QR は物理的に配る
     * ＝ 信頼できる経路。
     *
     * QR には base64 で入っている（PEM をそのまま JSON に置くと改行のエスケープで
     * 壊れやすく、壊れても QR は生成できてしまうため）。
     *
     * 冪等: 既に入っていれば何もしない。
     */
    fun installInternalCa(context: Context, caBytes: ByteArray) {
        if (!isDeviceOwner(context)) return
        val bytes = caBytes
        if (bytes.isEmpty()) return
        val dpm = dpm(context)
        val admin = admin(context)
        try {
            if (dpm.hasCaCertInstalled(admin, bytes)) return
            val ok = dpm.installCaCert(admin, bytes)
            android.util.Log.i("KioskMode", "internal CA install: $ok")
        } catch (e: Exception) {
            // CA が入らなくても公開 URL（BASE_URL）では動くので、致命傷にはしない。
            android.util.Log.w("KioskMode", "internal CA install failed", e)
        }
    }

    /**
     * プロビジョニング時の admin extras から CA を取り出して入れる。
     * QR に CA が入っていない（従来どおりの運用）なら何もしない。
     */
    fun installCaFromProvisioningExtras(context: Context, intent: Intent?) {
        val extras = intent?.getParcelableExtra<android.os.PersistableBundle>(
            DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE,
        ) ?: return
        val b64 = extras.getString(EXTRA_INTERNAL_CA_PEM_BASE64) ?: return
        val bytes = try {
            android.util.Base64.decode(b64, android.util.Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
            android.util.Log.w("KioskMode", "internal CA is not valid base64", e)
            return
        }
        installInternalCa(context, bytes)
    }

    /** プロビジョニング QR の admin extras で CA を渡すときのキー（base64）。 */
    const val EXTRA_INTERNAL_CA_PEM_BASE64 = "jp.co.ckk.kiosk.INTERNAL_CA_PEM_BASE64"

    /** メンテナンス退出時にステータスバーを一時的に戻す（復帰時に再適用）。 */
    fun setStatusBarDisabled(context: Context, disabled: Boolean) {
        if (!isDeviceOwner(context)) return
        dpm(context).setStatusBarDisabled(admin(context), disabled)
    }

    /**
     * デバイスオーナー解除 — ポリシーを全て戻してから権限を放棄する。
     * 以後は通常アプリに戻る（アンインストールも可能になる）。
     */
    fun clearDeviceOwner(context: Context) {
        if (!isDeviceOwner(context)) return
        val dpm = dpm(context)
        val admin = admin(context)
        val pkg = context.packageName

        for (permission in RUNTIME_PERMISSIONS) {
            dpm.setPermissionGrantState(
                admin,
                pkg,
                permission,
                DevicePolicyManager.PERMISSION_GRANT_STATE_DEFAULT,
            )
        }
        dpm.setStatusBarDisabled(admin, false)
        dpm.setKeyguardDisabled(admin, false)
        dpm.clearPackagePersistentPreferredActivities(admin, pkg)
        dpm.setLockTaskPackages(admin, emptyArray())
        context.packageManager.setComponentEnabledSetting(
            ComponentName(pkg, HOME_ALIAS),
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP,
        )
        @Suppress("DEPRECATION")
        dpm.clearDeviceOwnerApp(pkg)
    }
}
