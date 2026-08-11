package jp.co.ckk.kiosk

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/**
 * Android 12+ の QR プロビジョニングで必須の 2 アクティビティ。
 * セットアップウィザードから呼ばれ、UI は出さず即応答する。
 */

/** GET_PROVISIONING_MODE — 「フル管理端末（デバイスオーナー）」を返す。 */
class GetProvisioningModeActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // DevicePolicyManager.EXTRA_PROVISIONING_MODE /
        // PROVISIONING_MODE_FULLY_MANAGED_DEVICE（API 31 定数のためリテラルで指定）
        val result = Intent().putExtra("android.app.extra.PROVISIONING_MODE", 1)
        setResult(RESULT_OK, result)
        finish()
    }
}

/** ADMIN_POLICY_COMPLIANCE — ポリシー適用して完了を返す。 */
class AdminPolicyComplianceActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        KioskMode.applyPolicies(this)
        setResult(RESULT_OK)
        finish()
    }
}
