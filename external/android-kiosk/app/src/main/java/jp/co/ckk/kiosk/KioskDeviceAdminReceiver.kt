package jp.co.ckk.kiosk

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent

/**
 * KioskDeviceAdminReceiver — デバイスオーナー（Device Policy Controller）の受け口。
 *
 * QR プロビジョニング（tools/provisioning-qr.sh）または
 * `adb shell dpm set-device-owner` でこのアプリがデバイスオーナーになると、
 * KioskMode がタブレットを専用端末（Lock Task）として構成する。
 */
class KioskDeviceAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        KioskMode.applyPolicies(context)
    }

    // Android 11 以前の QR プロビジョニング完了フック（12+ は
    // AdminPolicyComplianceActivity 経由）
    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        super.onProfileProvisioningComplete(context, intent)
        // QR の admin extras に社内 CA が入っていれば端末へ入れる（LAN URL 用）。
        KioskMode.installCaFromProvisioningExtras(context, intent)
        KioskMode.applyPolicies(context)
        context.startActivity(
            Intent(context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}
