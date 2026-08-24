package jp.co.ckk.kiosk

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.Calendar
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONObject

/**
 * SelfUpdater — /apk/version.json をポーリングして自身を更新する。
 *
 * ロック済み（デバイスオーナー）端末にはブラウザが無く、従来は USB adb か
 * 初期化 + QR 再スキャンでしか更新できなかった。この仕組みで:
 *
 * 1. {BASE_URL}/apk/version.json を定期取得（クエリ付き = CDN キャッシュ回避）
 * 2. 自フレーバーの versionCode が今より新しければ APK をダウンロード
 *    （?v=<versionCode> でこちらも CDN キャッシュを回避）
 * 3. SHA-256 を version.json と照合してから PackageInstaller で更新
 *    - デバイスオーナー: サイレント更新（ダイアログなし・自動で再起動）
 *    - 通常インストール: OS の確認ダイアログが出る（提供元許可が必要）
 * 4. 更新完了後は UpdateReceiver（MY_PACKAGE_REPLACED）がアプリを再起動
 *
 * 実行タイミング: 起動 30 秒後に 1 回（起動直後 = 使用中でないため即インストール可）、
 * 以後 1 時間ごとにチェック。定期チェックで見つけた更新は、業務中の再起動を
 * 避けるため深夜帯（1:00–5:59）のみ適用する。
 */
object SelfUpdater {

    private const val TAG = "KioskUpdate"
    private const val FIRST_CHECK_DELAY_MS = 30_000L
    private const val CHECK_INTERVAL_MS = 60L * 60 * 1000
    private val INSTALL_WINDOW_HOURS = 1..5

    private val handler = Handler(Looper.getMainLooper())
    private val running = AtomicBoolean(false)
    private var scheduled = false

    /** MainActivity.onCreate から一度だけ呼ぶ（多重呼び出しは無視）。 */
    fun schedule(context: Context) {
        if (scheduled) return
        scheduled = true
        val app = context.applicationContext
        handler.postDelayed({ checkNow(app, installNow = true) }, FIRST_CHECK_DELAY_MS)
        handler.postDelayed(
            object : Runnable {
                override fun run() {
                    checkNow(app, installNow = false)
                    handler.postDelayed(this, CHECK_INTERVAL_MS)
                }
            },
            CHECK_INTERVAL_MS,
        )
    }

    /**
     * 即時チェック。installNow = false のときは深夜帯のみインストールする
     * （それ以外は次回チェックまで持ち越し）。
     */
    fun checkNow(context: Context, installNow: Boolean) {
        if (!running.compareAndSet(false, true)) return
        Thread {
            try {
                runCheck(context.applicationContext, installNow)
            } catch (e: Exception) {
                Log.w(TAG, "update check failed: ${e.message}")
            } finally {
                running.set(false)
            }
        }.start()
    }

    private fun runCheck(context: Context, installNow: Boolean) {
        val info = fetchJson(
            "${BuildConfig.BASE_URL}/apk/version.json?t=${System.currentTimeMillis()}",
        ).getJSONObject(BuildConfig.UPDATE_FLAVOR)
        val remoteCode = info.getInt("versionCode")
        val remoteSha = info.getString("sha256").lowercase()

        if (remoteCode <= BuildConfig.VERSION_CODE) return
        val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        if (!installNow && hour !in INSTALL_WINDOW_HOURS) {
            Log.i(TAG, "update to $remoteCode available; deferring to night window")
            return
        }

        Log.i(TAG, "updating ${BuildConfig.VERSION_CODE} -> $remoteCode")
        val apk = File(context.cacheDir, "update.apk")
        try {
            val sha = download(
                "${BuildConfig.BASE_URL}/apk/${BuildConfig.APK_NAME}?v=$remoteCode",
                apk,
            )
            if (sha != remoteSha) {
                Log.w(TAG, "sha256 mismatch (got $sha) — aborting, will retry")
                return
            }
            install(context, apk)
        } finally {
            apk.delete()
        }
    }

    private fun fetchJson(url: String): JSONObject {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 15_000
        conn.readTimeout = 15_000
        try {
            return JSONObject(conn.inputStream.bufferedReader().readText())
        } finally {
            conn.disconnect()
        }
    }

    /** URL を file へ保存し、SHA-256（hex 小文字）を返す。 */
    private fun download(url: String, file: File): String {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 15_000
        conn.readTimeout = 120_000
        try {
            val digest = MessageDigest.getInstance("SHA-256")
            conn.inputStream.use { input ->
                file.outputStream().use { output ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        digest.update(buf, 0, n)
                        output.write(buf, 0, n)
                    }
                }
            }
            return digest.digest().joinToString("") { "%02x".format(it) }
        } finally {
            conn.disconnect()
        }
    }

    private fun install(context: Context, apk: File) {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(
            PackageInstaller.SessionParams.MODE_FULL_INSTALL,
        ).apply {
            setAppPackageName(context.packageName)
            // デバイスオーナーなら確認ダイアログなしのサイレント更新（API 31+。
            // それ未満はデバイスオーナーであれば元々確認なしで通る）
            if (Build.VERSION.SDK_INT >= 31 && KioskMode.isDeviceOwner(context)) {
                setRequireUserAction(
                    PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED,
                )
            }
        }
        val sessionId = installer.createSession(params)
        installer.openSession(sessionId).use { session ->
            session.openWrite("app.apk", 0, apk.length()).use { out ->
                apk.inputStream().use { it.copyTo(out) }
                session.fsync(out)
            }
            val statusIntent = Intent(context, UpdateReceiver::class.java)
                .setAction(UpdateReceiver.ACTION_INSTALL_STATUS)
            var flags = PendingIntent.FLAG_UPDATE_CURRENT
            if (Build.VERSION.SDK_INT >= 31) {
                // インストーラが status extra を書き込むため MUTABLE 必須
                flags = flags or PendingIntent.FLAG_MUTABLE
            }
            val pending =
                PendingIntent.getBroadcast(context, sessionId, statusIntent, flags)
            session.commit(pending.intentSender)
        }
    }
}
