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
        versionCode = 8
        versionName = "0.5.3"

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
            // 自己更新（SelfUpdater）: version.json のキーと配布 APK 名
            buildConfigField("String", "UPDATE_FLAVOR", "\"dev\"")
            buildConfigField("String", "APK_NAME", "\"ckk-kiosk-dev.apk\"")
            resValue("string", "app_name", "CKK Kiosk (dev)")
        }
        create("prod") {
            dimension = "env"
            buildConfigField("String", "BASE_URL", "\"https://ckk-kiosk.kai-lab.net\"")
            buildConfigField("String", "UPDATE_FLAVOR", "\"prod\"")
            buildConfigField("String", "APK_NAME", "\"ckk-kiosk.apk\"")
            resValue("string", "app_name", "CKK Kiosk")
        }
    }

    // release 署名: ~/.gradle/gradle.properties（コミット対象外）に
    // CKK_KEYSTORE_PATH / CKK_KEYSTORE_PASSWORD / CKK_KEY_ALIAS / CKK_KEY_PASSWORD
    // が揃っているときのみ署名する。無ければ unsigned のままビルド可能。
    val releaseKeystorePath = providers.gradleProperty("CKK_KEYSTORE_PATH").orNull
    if (releaseKeystorePath != null) {
        signingConfigs {
            create("release") {
                storeFile = file(releaseKeystorePath)
                storePassword = providers.gradleProperty("CKK_KEYSTORE_PASSWORD").get()
                keyAlias = providers.gradleProperty("CKK_KEY_ALIAS").get()
                keyPassword = providers.gradleProperty("CKK_KEY_PASSWORD").get()
            }
        }
    }

    buildTypes {
        release {
            // JS ブリッジ（addJavascriptInterface）を難読化で壊さないため minify 無効
            isMinifyEnabled = false
            if (releaseKeystorePath != null) {
                signingConfig = signingConfigs.getByName("release")
            }
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
