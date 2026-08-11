package jp.co.ckk.kiosk

import android.Manifest
import android.app.ActivityManager
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.provider.Settings
import android.text.InputType
import android.view.MotionEvent
import android.view.WindowManager
import android.widget.EditText
import android.widget.Toast
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * MainActivity — キオスク WebView シェル。
 *
 * - BuildConfig.BASE_URL（dev/prod フレーバー）のみ表示。外部ドメインへの
 *   ナビゲーションはブロック（リンクを踏んでも遷移しない）
 * - `window.KioskDevice`（KioskBridge）を注入 — 端末アテステーション用
 * - WebView 内 getUserMedia（QR スキャン）へカメラ権限をパススルー
 * - 画面常時 ON + イマーシブ（システムバー非表示）
 * - 戻るボタンは WebView 履歴内のみ（アプリは終了しない）
 *
 * デバイスオーナー時（QR プロビジョニング / adb dpm set-device-owner）は
 * KioskMode により Lock Task で端末をこのアプリに固定する。メンテナンスは
 * 画面左上を 5 回連続タップ → 管理者 PIN（BuildConfig.KIOSK_UNLOCK_PIN）。
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private var pendingPermissionRequest: PermissionRequest? = null

    // メンテナンス退出ジェスチャ（左上 5 連続タップ）
    private var cornerTapCount = 0
    private var cornerTapFirstAt = 0L
    private var maintenanceDialogShowing = false

    private val requestCamera =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            val request = pendingPermissionRequest
            pendingPermissionRequest = null
            if (request == null) return@registerForActivityResult
            if (granted) {
                request.grant(request.resources)
            } else {
                request.deny()
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // デバイスオーナーなら専用端末ポリシーを適用（それ以外は no-op）
        KioskMode.applyPolicies(this)

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        webView = WebView(this)
        setContentView(webView)

        val baseHost = Uri.parse(BuildConfig.BASE_URL).host

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            // ズーム無効（キオスク UI はタブレット前提のレイアウト）
            setSupportZoom(false)
        }
        webView.addJavascriptInterface(KioskBridge(), "KioskDevice")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean {
                // キオスクのホスト以外へは遷移させない
                return request.url.host != baseHost
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                val wantsCamera =
                    request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                val fromKiosk = Uri.parse(request.origin.toString()).host == baseHost
                if (!wantsCamera || !fromKiosk) {
                    request.deny()
                    return
                }
                if (ContextCompat.checkSelfPermission(
                        this@MainActivity,
                        Manifest.permission.CAMERA,
                    ) == PackageManager.PERMISSION_GRANTED
                ) {
                    request.grant(request.resources)
                } else {
                    pendingPermissionRequest = request
                    requestCamera.launch(Manifest.permission.CAMERA)
                }
            }
        }

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (webView.canGoBack()) webView.goBack()
                    // 履歴が無ければ何もしない（キオスクを閉じさせない）
                }
            },
        )

        if (savedInstanceState == null) {
            webView.loadUrl(BuildConfig.BASE_URL)
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        // メンテナンスから戻ったとき等に Lock Task とステータスバー無効を復元
        if (KioskMode.isDeviceOwner(this) && !maintenanceDialogShowing) {
            KioskMode.setStatusBarDisabled(this, true)
            if (lockTaskModeState() == ActivityManager.LOCK_TASK_MODE_NONE) {
                startLockTask()
            }
        }
    }

    private fun lockTaskModeState(): Int =
        (getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).lockTaskModeState

    // ─── メンテナンス退出（左上 5 連続タップ → PIN） ───────────────

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        if (ev.action == MotionEvent.ACTION_DOWN) trackMaintenanceTap(ev)
        return super.dispatchTouchEvent(ev)
    }

    private fun trackMaintenanceTap(ev: MotionEvent) {
        if (!KioskMode.isDeviceOwner(this) || maintenanceDialogShowing) return
        val corner = resources.displayMetrics.density * 96 // 左上 96dp 四方
        if (ev.x > corner || ev.y > corner) {
            cornerTapCount = 0
            return
        }
        val now = SystemClock.elapsedRealtime()
        if (now - cornerTapFirstAt > 3_000) cornerTapCount = 0
        if (cornerTapCount == 0) cornerTapFirstAt = now
        cornerTapCount++
        if (cornerTapCount >= 5) {
            cornerTapCount = 0
            showMaintenanceDialog()
        }
    }

    private fun showMaintenanceDialog() {
        maintenanceDialogShowing = true
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            hint = "管理者 PIN"
        }
        val dialog = AlertDialog.Builder(this)
            .setTitle("メンテナンス")
            .setMessage("設定を開く: 一時的にロックを外して Android 設定へ\nキオスク解除: デバイスオーナーを解除（元に戻すには再プロビジョニング）")
            .setView(input)
            .setPositiveButton("設定を開く", null)
            .setNeutralButton("キオスク解除", null)
            .setNegativeButton("キャンセル", null)
            .create()
        dialog.setOnDismissListener { maintenanceDialogShowing = false }
        dialog.show()
        // PIN 不一致時に閉じないよう、show() 後にクリックリスナーを差し替える
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            if (!verifyPin(input)) return@setOnClickListener
            dialog.dismiss()
            stopLockTaskSafely()
            KioskMode.setStatusBarDisabled(this, false)
            startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener {
            if (!verifyPin(input)) return@setOnClickListener
            dialog.dismiss()
            stopLockTaskSafely()
            KioskMode.clearDeviceOwner(this)
            Toast.makeText(this, "キオスクモードを解除しました", Toast.LENGTH_LONG).show()
        }
    }

    private fun verifyPin(input: EditText): Boolean {
        if (input.text.toString() == BuildConfig.KIOSK_UNLOCK_PIN) return true
        input.error = "PIN が違います"
        input.setText("")
        return false
    }

    private fun stopLockTaskSafely() {
        if (lockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE) stopLockTask()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    private fun hideSystemBars() {
        WindowInsetsControllerCompat(window, webView).apply {
            systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            hide(WindowInsetsCompat.Type.systemBars())
        }
    }
}
