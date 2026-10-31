plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "br.com.superhqs.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "br.com.superhqs.app"
        minSdk = 26
        targetSdk = 35
        // o número de cada build do GitHub Actions: cada APK novo é uma versão maior
        versionCode = (System.getenv("SH_VERSAO_CODIGO") ?: "1").toInt()
        versionName = System.getenv("SH_VERSAO_NOME") ?: "1.0"
    }

    // A chave vem do ambiente (o segredo do GitHub, ou uma gerada no Actions).
    // Nunca fica no repositório.
    signingConfigs {
        create("release") {
            storeFile = file(System.getenv("SH_KEYSTORE") ?: "superhqs.jks")
            storePassword = System.getenv("SH_STORE_PASS") ?: ""
            keyAlias = System.getenv("SH_KEY_ALIAS") ?: "superhqs"
            keyPassword = System.getenv("SH_KEY_PASS") ?: System.getenv("SH_STORE_PASS") ?: ""
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
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
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.5.0")
    implementation("androidx.browser:browser:1.8.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
}
