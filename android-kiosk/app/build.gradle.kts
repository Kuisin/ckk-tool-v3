plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "jp.co.ckk.kiosk"
    compileSdk = 35

    defaultConfig {
        applicationId = "jp.co.ckk.kiosk"
        minSdk = 29
        targetSdk = 35
        versionCode = 2
        versionName = "0.2.0"

        // メンテナンス退出 PIN（デバイスオーナー時、右上 5 タップ → PIN 入力）。
        // 既定値のまま配布しないこと — ~/.gradle/gradle.properties（コミット対象外）に
        // KIOSK_UNLOCK_PIN=xxxx を書いてビルドすると上書きされる。
        val unlockPin = providers.gradleProperty("KIOSK_UNLOCK_PIN").getOrElse("246810")
        buildConfigField("String", "KIOSK_UNLOCK_PIN", "\"$unlockPin\"")
    }

    // dev / prod でロード先を切替（applicationIdSuffix で併存インストール可）
    flavorDimensions += "env"
    productFlavors {
        create("dev") {
            dimension = "env"
            applicationIdSuffix = ".dev"
            buildConfigField("String", "BASE_URL", "\"https://ckk-kiosk-dev.kai-lab.net\"")
            resValue("string", "app_name", "CKK Kiosk (dev)")
        }
        create("prod") {
            dimension = "env"
            buildConfigField("String", "BASE_URL", "\"https://ckk-kiosk.kai-lab.net\"")
            resValue("string", "app_name", "CKK Kiosk")
        }
    }

    buildTypes {
        release {
            // JS ブリッジ（addJavascriptInterface）を難読化で壊さないため minify 無効
            isMinifyEnabled = false
        }
    }
    buildFeatures {
        buildConfig = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
}
