# O que vai no repositório `carlosjr81.github.io`

Esta pasta **não é servida** pelo Super HQs. É o lembrete do que precisa estar na
**raiz do domínio** (`https://carlosjr81.github.io/`), que é outro repositório:
`carlosjr81.github.io`, o mesmo que já serve o Treino Livre.

O `.well-known/assetlinks.json` de lá precisa ganhar **mais uma entrada**, para o
app `br.com.superhqs.app`, **sem apagar a do Treino Livre**. A impressão digital
sai do passo "Impressão digital da chave" do workflow App Android, depois do
primeiro APK.

**Feito em 31/10/2026**: a entrada do Super HQs está no repositório do domínio,
com a impressão digital
`8B:0F:64:D7:C2:C1:D8:AF:ED:CC:A1:B0:82:69:4F:C1:AF:96:F6:2F:79:DA:71:74:0A:82:15:57:6F:09:22:7A`
(a chave do cache do Actions). Se a chave mudar, este número muda e a barra volta.

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
