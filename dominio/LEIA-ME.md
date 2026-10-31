# O que vai no repositório `carlosjr81.github.io`

Esta pasta **não é servida** pelo Super HQs. É o lembrete do que precisa estar na
**raiz do domínio** (`https://carlosjr81.github.io/`), que é outro repositório:
`carlosjr81.github.io`, o mesmo que já serve o Treino Livre.

O `.well-known/assetlinks.json` de lá precisa ganhar **mais uma entrada**, para o
app `br.com.superhqs.app`, **sem apagar a do Treino Livre**. A impressão digital
sai do passo "Impressão digital da chave" do workflow App Android, depois do
primeiro APK. Até lá o app abre com a barra de endereço do Chrome no topo.

A entrada a acrescentar (trocar o `XX:...` pela impressão digital):

```json
{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "br.com.superhqs.app",
    "sha256_cert_fingerprints": ["XX:..."]
  }
}
```

Conferir depois de publicar:
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://carlosjr81.github.io&relation=delegate_permission/common.handle_all_urls
