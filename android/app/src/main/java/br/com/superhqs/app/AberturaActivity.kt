package br.com.superhqs.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import com.google.androidbrowserhelper.trusted.TwaLauncher

// O ícone do app: abre o site no Chrome. Um link https que chegue aqui (de um
// compartilhamento) abre direto nele.
class AberturaActivity : ComponentActivity() {
    private var lancador: TwaLauncher? = null
    private var abriu = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState != null) return
        val pedido = intent?.data
        val uri = if (pedido != null && pedido.scheme == "https") pedido else Site.endereco()
        Site.abrir(this, uri, { lancador = it }) { abriu = true }
    }

    // A pessoa voltou do site para cá (botão voltar): o app fecha
    override fun onRestart() {
        super.onRestart()
        if (abriu) finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        lancador?.destroy()
    }
}
