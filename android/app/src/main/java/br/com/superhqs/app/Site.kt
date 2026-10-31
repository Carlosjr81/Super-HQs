package br.com.superhqs.app

import android.app.Activity
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.trusted.TrustedWebActivityIntentBuilder
import com.google.androidbrowserhelper.trusted.TwaLauncher

// O app é o site, aberto no Chrome em tela cheia (Trusted Web Activity), como
// no Treino Livre: a estante guardada no Chrome continua a mesma, e uma
// atualização do site chega sem atualizar o APK.
object Site {
    const val ENDERECO = "https://carlosjr81.github.io/Super-HQs/"
    const val CHROME = "com.android.chrome"

    fun endereco(): Uri = Uri.parse("$ENDERECO?app=android")

    // O Chrome, de propósito, mesmo quando outro navegador é o padrão: é nele
    // que estão a estante e a conta de quem já usava o site.
    private fun provedor(activity: Activity): String? = try {
        activity.packageManager.getPackageInfo(CHROME, 0)
        CHROME
    } catch (e: PackageManager.NameNotFoundException) {
        null
    }

    fun abrir(activity: Activity, uri: Uri, guardar: (TwaLauncher) -> Unit, depois: () -> Unit) {
        val cor = Color.parseColor("#0B0B0F")
        val cores = CustomTabColorSchemeParams.Builder()
            .setToolbarColor(cor)
            .setNavigationBarColor(cor)
            .build()
        val pedido = TrustedWebActivityIntentBuilder(uri).setDefaultColorSchemeParams(cores)
        val lancador = TwaLauncher(activity, provedor(activity))
        guardar(lancador)
        lancador.launch(pedido, null, null) { depois() }
    }
}
