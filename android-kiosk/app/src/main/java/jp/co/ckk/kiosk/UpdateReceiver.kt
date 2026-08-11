package jp.co.ckk.kiosk

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.util.Log

/**
 * UpdateReceiver — 自己更新（SelfUpdater）の 2 つのイベントを受ける。
 *
 * - PackageInstaller のセッション結果（ACTION_INSTALL_STATUS）:
 *   デバイスオーナーでない端末では STATUS_PENDING_USER_ACTION が届くので
 *   OS の確認ダイアログを起動する（デバイスオーナーならサイレントに完了）。
 * - ACTION_MY_PACKAGE_REPLACED: 更新適用後にアプリを自動再起動する
 *   （デバイスオーナー時はホーム固定でも起動するが、通常端末のための保険）。
 */
class UpdateReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_INSTALL_STATUS = "jp.co.ckk.kiosk.INSTALL_STATUS"
        private const val TAG = "KioskUpdate"
    }

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_MY_PACKAGE_REPLACED -> {
                Log.i(TAG, "package replaced — relaunching kiosk")
                context.startActivity(
                    Intent(context, MainActivity::class.java)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
            }
            ACTION_INSTALL_STATUS -> {
                val status = intent.getIntExtra(
                    PackageInstaller.EXTRA_STATUS,
                    PackageInstaller.STATUS_FAILURE,
                )
                when (status) {
                    PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                        val confirm: Intent? =
                            if (Build.VERSION.SDK_INT >= 33) {
                                intent.getParcelableExtra(
                                    Intent.EXTRA_INTENT,
                                    Intent::class.java,
                                )
                            } else {
                                @Suppress("DEPRECATION")
                                intent.getParcelableExtra(Intent.EXTRA_INTENT)
                            }
                        if (confirm != null) {
                            confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            context.startActivity(confirm)
                        }
                    }
                    PackageInstaller.STATUS_SUCCESS ->
                        Log.i(TAG, "update installed")
                    else ->
                        Log.w(
                            TAG,
                            "install failed ($status): " +
                                intent.getStringExtra(
                                    PackageInstaller.EXTRA_STATUS_MESSAGE,
                                ),
                        )
                }
            }
        }
    }
}
