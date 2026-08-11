package jp.co.ckk.kiosk

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
