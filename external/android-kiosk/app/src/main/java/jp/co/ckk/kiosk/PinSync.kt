package jp.co.ckk.kiosk

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.CookieManager
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

/**
 * PinSync — メンテナンス退出 PIN のサーバー同期。
 *
 * PIN は全端末共通で毎日自動更新される（system_settings kiosk.unlock_pin —
 * SY09 端末詳細で確認可能）。GET /api/kiosk/unlock-pin を端末 Cookie
 * （WebView の CookieManager から取得）付きで呼び、SharedPreferences に保存する。
 * 未同期（未リンク端末など）の間は BuildConfig.KIOSK_UNLOCK_PIN が
 * フォールバックとして使われる。
 *
 * 同期タイミング: 起動 20 秒後 + 1 時間ごと + メンテナンスダイアログ表示時。
 */
object PinSync {

    private const val TAG = "KioskPin"
    private const val PREFS = "kiosk"
    private const val KEY_PIN = "unlock_pin"
    private const val FIRST_SYNC_DELAY_MS = 20_000L
    private const val SYNC_INTERVAL_MS = 60L * 60 * 1000

    private val handler = Handler(Looper.getMainLooper())
    private var scheduled = false

    /** 現在有効な PIN（同期済みならサーバー値、未同期ならビルド時の既定値）。 */
    fun current(context: Context): String =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_PIN, null) ?: BuildConfig.KIOSK_UNLOCK_PIN

    /** 定期同期を開始する（多重呼び出しは無視）。 */
    fun schedule(context: Context) {
        if (scheduled) return
        scheduled = true
        val app = context.applicationContext
        handler.postDelayed({ syncNow(app) }, FIRST_SYNC_DELAY_MS)
        handler.postDelayed(
            object : Runnable {
                override fun run() {
                    syncNow(app)
                    handler.postDelayed(this, SYNC_INTERVAL_MS)
                }
            },
            SYNC_INTERVAL_MS,
        )
    }

    /** 即時同期（メンテナンスダイアログ表示時にも呼ぶ）。失敗は黙って保持値のまま。 */
    fun syncNow(context: Context) {
        val app = context.applicationContext
        Thread {
            try {
                val cookies = CookieManager.getInstance().getCookie(BuildConfig.BASE_URL)
                val conn = URL("${BuildConfig.BASE_URL}/api/kiosk/unlock-pin")
                    .openConnection() as HttpURLConnection
                conn.connectTimeout = 5_000
                conn.readTimeout = 5_000
                if (!cookies.isNullOrEmpty()) conn.setRequestProperty("Cookie", cookies)
                try {
                    if (conn.responseCode == 200) {
                        val body = conn.inputStream.bufferedReader().readText()
                        val pin = JSONObject(body).optString("pin")
                        if (pin.length in 4..8) {
                            app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                                .edit().putString(KEY_PIN, pin).apply()
                        }
                    }
                } finally {
                    conn.disconnect()
                }
            } catch (e: Exception) {
                Log.d(TAG, "pin sync skipped: ${e.message}")
            }
        }.start()
    }
}
