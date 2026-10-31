# Estabilidade, diagnóstico, perfis e distribuição — 30/10/2026

Esta revisão implementa as cinco frentes autorizadas, com bloqueios explícitos onde faltam evidência física ou credenciais de distribuição. Não habilita DPI/polling por inferência nem cria certificados fictícios. A interface HTML/CSS existente foi mantida, com controles adicionados em Configurações → Windows.

## Processo de hardware

Fluxo: renderer → preload → IPC com origem/aridade/limites → HardwareProcess no Main → utilityProcess privado → HardwareService → HID/OpenRGB.

O Main não importa adaptadores HID nem Koffi. Descoberta Windows, acesso HID, cliente SDK e leitura opcional do aplicativo em primeiro plano ficam no processo auxiliar. O Main continua responsável pela janela, armazenamento, diálogos, logs, verificação de atualizações e ciclo de vida do motor OpenRGB empacotado.

Chamadas têm prazo de 25 segundos, escolhido para acomodar a consulta Windows existente com limite de 15 segundos. Ao perder comunicação ou exceder o prazo, o proxy rejeita operações, limpa capacidades em cache e solicita encerramento do filho. Envios interrompidos ficam com estado físico incerto. Não há repetição automática de escrita. Um novo filho só pode ser iniciado por consulta explícita e após o evento de saída do anterior; se o Windows não confirmar o encerramento, a rota permanece bloqueada. Encerrar o app também interrompe o filho.

No pacote, falha ao iniciar o motor RGB próprio deixa o SDK desabilitado; não conecta silenciosamente a uma porta externa substituta. Em desenvolvimento, continua sendo utilizado o SDK externo local na porta 6742.

O prazo impede que I/O nativo bloqueie o Main; não desfaz relatórios já aceitos nem garante que LEDs mudaram. Handles de hardware não cruzam a fronteira. Não foram alterados os bytes dos protocolos existentes.

## Diagnóstico exportável

Em Configurações → Windows, Consultar diagnóstico usa o estado atual em cache e mostra o processo de hardware, descoberta, SDK, adaptadores e motivos de indisponibilidade. Não faz escrita física nem inicia uma nova descoberta. Exportar diagnóstico abre o seletor nativo e grava JSON no destino escolhido pelo usuário.

O arquivo contém referências como device-1, VID/PID, categoria, estado, capacidades booleanas, adaptador conhecido e motivos fixos de bloqueio, além da versão da aplicação e contadores dos logs. Omite nome de dispositivo, fabricante, serial, identificador nativo, caminho, aplicativo em primeiro plano, payload e texto bruto de erros. Não anexa os logs integrais. Arquivos de diagnóstico ainda revelam modelos prováveis por VID/PID; compartilhe apenas com destinatários desejados.

## Perfis locais

Na tela de Mouse, configure estágios e botões locais. Na tela RGB, prepare iluminação. Em Configurações → Windows → Seu setup por aplicativo, informe um nome e salve a configuração atual. Cada perfil inclui iluminação, cinco estágios de DPI, estágio selecionado, cinco ações de botões, polling desejado e escala da interface. Até 12 perfis são gravados em userData/setup-profiles.json, com validação, serialização, arquivo temporário, sincronização e substituição por rename.

Selecionar um perfil restaura os controles locais e a prévia, sem escrever hardware. Aplicar RGB salvo envia somente iluminação pelos adaptadores disponíveis. DPI, polling, botões e memória embarcada continuam locais e são listados como não aplicados. Um efeito sem suporte provoca recusa, sem tentativa de protocolo alternativo. O adaptador HID padrão continua restrito ao G11 e à revisão registrada; X11/SK80 continuam fora do registro de escrita.

Um aplicativo opcional é informado pelo nome do executável, como jogo.exe, sem caminho ou argumentos. Aplicar RGB ao entrar nesse aplicativo exige marcar e salvar a opção, inicialmente desligada. Só então o processo auxiliar consulta o executável em primeiro plano a cada dois segundos. Não guarda títulos de janela ou caminhos. A correspondência usa o nome do .exe; programas diferentes com o mesmo nome não são distinguidos. Processos protegidos ou nomes fora do conjunto aceito podem não ser reconhecidos.

Cada mudança de aplicativo pode acionar um perfil autorizado. Não há nova tentativa automática após falha/estado incerto e não há restauração automática ao sair. Importação usa seletor nativo, limite de 128 KiB, validação e confirmação de substituição. Todos os perfis importados têm aplicação automática desligada. Exportação de perfis inclui nomes e aplicativos vinculados; ela tem conteúdo diferente do diagnóstico sanitizado. Arquivos corrompidos são reportados e não são sobrescritos silenciosamente.

## DPI, polling e perfis físicos

Nenhum protocolo físico novo para esses controles foi confirmado. hardware:status mantém dpi/pollingRate/onboardProfiles como false; mouse:apply valida o contrato e rejeita com ERR_UNSUPPORTED_CAPABILITY antes de sondar ou escrever hardware. Não basta alterar um campo de capacidade para habilitar envio. Os limites locais de DPI e polling não representam valores suportados por um modelo.

Habilitar cada operação exige captura ou documentação do protocolo da revisão exata, limites próprios, validação dos relatórios, teste físico registrado e testes de falha/desconexão. Esta revisão não executou testes físicos nem enviou comandos novos a dispositivos.

## Distribuição e atualizações assinadas

A configuração do electron-builder usa forceCodeSigning: true e verifyUpdateCodeSignature: true. O executável da interface foi alterado para asInvoker: a aplicação não solicita administrador ao abrir. O instalador perMachine e seu suporte de driver preexistente ainda podem exigir elevação. Não foi criado um serviço privilegiado para o motor RGB; componentes internos que dependem de administrador podem ficar indisponíveis no modo comum. Esse comportamento ainda requer validação física no pacote assinado.

src/config/update-trust.json permanece enabled: false. Faltam URL oficial HTTPS, chave pública Ed25519 e Subject exato do certificado Windows do publicador. Sem eles, Verificar atualizações explica o bloqueio e não faz requisições. O controle preexistente de atualização automática permanece desabilitado; esta entrega oferece verificação, download e instalação manuais, sem instalação silenciosa ou monitoramento de atualizações em segundo plano.

Quando a configuração for fornecida na distribuição, o fluxo implementado é:

1. Obter um envelope JSON HTTPS de no máximo 64 KiB, sem redirecionamentos.
2. Verificar assinatura Ed25519 dos bytes do manifesto com a chave fixada na distribuição.
3. Exigir Windows x64, versão compatível sem downgrade, validade máxima de sete dias e URL do instalador na mesma origem HTTPS do manifesto.
4. Baixar para diretório temporário próprio, com prazo de 120 segundos, limite de 512 MiB, tamanho exato e SHA-256 assinado.
5. Verificar Authenticode com cadeia aceita pelo Windows e Subject exato do publicador configurado.
6. Mediante clique e confirmação nativa, verificar manifesto, arquivo e publicador novamente. Na execução Windows, manter o arquivo aberto com compartilhamento somente de leitura durante a verificação final e o início do instalador, para bloquear alterações/exclusão nessa janela. O instalador solicita sua própria elevação. O PrismHub só fecha após confirmar seu início.

Não se entrega chave privada no aplicativo. O publicador precisa renovar o manifesto assinado antes de expirar, inclusive quando a versão não mudar. Metadados assinados ainda podem ser repetidos durante sua validade; uma versão inferior à instalada é rejeitada. Arquivos temporários de instalações iniciadas podem permanecer em userData/updates até limpeza administrativa. O serviço não protege contra um administrador ou publicador comprometido.

### Preparar uma distribuição real

- Defina URL oficial, chave pública Ed25519 e publisherSubject em src/config/update-trust.json e habilite-o no código de distribuição.
- Configure o certificado Windows via WIN_CSC_LINK ou CSC_LINK e a senha correspondente conforme electron-builder. Certificados, chaves e senhas não devem ser registrados no Git.
- Execute npm run release:preflight e npm run dist:win. A falta de certificado bloqueia a geração antes da preparação do runtime.
- Para publicar metadados, configure PRISMHUB_UPDATE_PRIVATE_KEY_FILE (e PRISMHUB_UPDATE_KEY_PASSPHRASE se necessário) e execute npm run release:manifest -- <instalador.exe> <versão> <URL-HTTPS-do-instalador>. O script verifica a assinatura Windows, gera SHA-256 e grava o envelope assinado em dist/update-manifest.json. Ele não publica arquivos.
- Teste o pacote assinado, privilégios, UAC, modelo de hardware e atualização em ambiente de validação antes da distribuição. Não há build assinado ou feed real nesta entrega.

## API adicional

Todos os canais continuam restritos ao frame principal do documento local. Sem parâmetros: diagnostics:get/export, profiles:list/import/export, updates:status/check/stage/install. Com exatamente um parâmetro: profiles:save (perfil validado), profiles:remove (ID) e profiles:apply (ID). A API não aceita URL de atualização, chave, caminho de exportação ou executável enviado pelo renderer. Aplicação automática retorna apenas ID de perfil e estado no evento profiles:automatic.

## Arquivos principais

- src/modules/hardwareProcess.js e hardwareWorker.js; src/hardware/windows-foreground.js.
- src/modules/diagnostics.js, desktopServices.js, profileStore.js, profileAutomation.js e signedUpdates.js.
- src/shared/profiles.js, src/config/update-trust.json, main.js, ipcHandlers.js e preload.cjs.
- src/renderer/modules/desktop.js, integração dos controladores locais de Mouse/RGB/Preferências e cartões de Configurações.
- scripts/security-smoke.mjs, check-source.mjs, release-preflight.mjs, create-update-manifest.mjs e testes correspondentes.

## Fontes técnicas

- [Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process) e [parentPort](https://www.electronjs.org/docs/latest/api/parent-port).
- [Assinatura Windows no electron-builder](https://www.electron.build/v26/docs/features/code-signing/) e [configuração Windows](https://www.electron.build/v26/docs/win/).
