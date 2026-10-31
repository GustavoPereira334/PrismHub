# Reforço de segurança — 30/10/2026

> Registro da primeira revisão. A revisão seguinte moveu o hardware para utilityProcess, adicionou perfis/diagnóstico/atualizações verificadas e alterou o executável para asInvoker. Consulte desktop-features.md para o estado atual e os limites de distribuição.

## Escopo e critérios

Preservar o HTML/CSS/JS e as alterações locais anteriores. O renderer é uma fronteira de confiança: ele não pode escolher caminhos nativos, relatórios HID ou comandos SDK. Entrada inválida ou capacidade sem protocolo confirmado deve falhar antes de consultar ou escrever hardware. Falhas e cancelamentos não podem ser apresentados como confirmação física. Não há servidor HTTP da aplicação que justifique Helmet; não foi adicionado.

## Implementado

- Electron mantém contextIsolation, sandbox e webSecurity, com Node e webview desativados. Bloqueia navegação principal e de subframes, redirecionamentos, novas janelas, anexação de webviews e downloads. Permissões gerais e de dispositivos são negadas. Eventos de hardware só são entregues ao documento local esperado.
- CSP declara connect-src, frame-src, worker-src e media-src como none, além das restrições existentes para scripts, objetos, formulários e base. O Main continua podendo acessar o SDK local via Node; o renderer não precisa de rede.
- IPC conserva a verificação de janela, frame principal e URL exata. Cada canal exige sua aridade correta, rejeita propriedades desconhecidas e limita frequência e operação simultânea por canal. Atualizações e escritas: intervalo mínimo de 1 segundo; leituras de lista/status: 50 ms. O serviço mantém sua exclusão de escritas concorrentes.
- Capacidades normalizadas aceitam somente chaves conhecidas e o booleano literal true. Strings, números e chaves arbitrárias não habilitam recursos.
- Logs JSONL em userData/logs/audit.jsonl, com rotação para audit.jsonl.1: 512 KiB por arquivo e fila máxima de 128 registros. Registra eventos fixos, canal, quantidade e estado parcial; omite payload, serial, ID de dispositivo, caminho nativo e texto bruto de erros. Falha de disco não transforma envio realizado em falha de hardware. Encerramento aguarda flush por até 1,5 segundo. Logs são locais, sem proteção contra adulteração pelo mesmo usuário, e podem perder eventos por fila cheia ou encerramento forçado.
- G11 verifica cancelamento e prazo de 3 segundos entre relatórios, preservando filtro de revisão/interface, serialização, limite de frequência, cadência e validação de tamanho existentes. HidManager propaga cancelamento ao adaptador. OpenRGB verifica cancelamento antes de cada controlador e entre preparação de modo e cor; mantém timeout, planos de uso único e invalidação por mudança de sessão/topologia.
- Registro HID padrão habilita somente G11 RGB estático, respaldado pela evidência física anterior documentada no repositório. SK80 e X11 não possuem evidência suficiente para ativação nesta revisão e ficam fora do registro de escrita, mesmo que uma solicitação tente aceitar risco. Seus módulos de pesquisa e testes permanecem; descoberta do Windows e fallback SDK continuam disponíveis.

## API interna v1

Todos os canais são exclusivos da ponte preload; não existe endpoint de rede ou IPC genérico exposto.

| Canal | Entrada | Resultado |
| --- | --- | --- |
| devices:list | Nenhuma | Lista atual |
| devices:refresh | Nenhuma | Consulta e lista atualizada |
| hardware:status | Nenhuma | apiVersion: 1, mouseControls, discovery, openrgb |
| lighting:apply | target, color, brightness, effect, speed opcional | Resultado existente: sent, devices, uncertainDevices, warnings, errors, partial, confirmation |
| mouse:apply | deviceId e exatamente um de dpi, pollingRate, profileSlot | Sempre rejeita nesta versão, sem sondagem ou escrita |

O contrato de mouse limita DPI a inteiros de 100–26000 em passos de 100, polling a 125/250/500/1000/2000/4000/8000 Hz e slot a 0–4. Estes limites validam a forma da solicitação; não representam capacidades físicas. Nenhum adaptador confirma protocolos dessas operações: mouseControls anuncia todos como false e o serviço rejeita com ERR_UNSUPPORTED_CAPABILITY. Electron preserva a mensagem da exceção, mas não garante transportar sua propriedade code. Perfis existentes continuam locais; selecioná-los não grava memória do dispositivo.

Para habilitar qualquer controle futuramente, é necessário implementar protocolo específico, limitar valores às capacidades daquela revisão, registrar evidência e teste físico, validar relatórios e testar desconexão/cancelamento. Um VID/PID ou campo true recebido do renderer não basta.

## Verificação e limites

- npm test: testes de contratos, limites IPC, capacidades, cancelamento, pacotes de referência, fragmentação/timeouts SDK, isolamento de adaptadores e rotação/falha dos logs.
- npm run check: sintaxe dos módulos da aplicação e do smoke test.
- npm run smoke:security: Electron real com preload real e provedores inertes. Testa ausência de require/process no renderer, rejeições IPC, conexão bloqueada pela CSP, navegação por Enter, perfis locais, controles indisponíveis sem hardware e ausência de overflow horizontal em 1440×900 e 1180×760. Não substitui inspeção visual completa, instalador ou teste físico.

Um teste legado do SK80 acessou o OpenRGB local durante a primeira execução após a mudança do registro e enviou RGB estático #112233 com brilho 80 ao destino de teclado SDK. Esse teste foi corrigido para usar um provedor simulado, sem rede e sem hardware real. Não houve tentativa de restaurar fisicamente a cor, pois o estado anterior não era conhecido.

Não foram instalados drivers, alterados firmware, gerado instalador, feito commit ou publicado pacote. O G11 não foi revalidado fisicamente nesta revisão: o registro anterior informa sucesso com o HUB oficial aberto e não confirma inicialização a frio. O SDK confirma transporte aceito, não LEDs. Não há rollback físico após envio parcial. O prazo do G11 só é checado entre chamadas: node-hid síncrono ainda pode bloquear o Main durante I/O; isolamento em worker/processo separado continua necessário para impor timeout real a uma chamada nativa travada. O app ainda usa file:// e o empacotamento anterior exige administrador; esta revisão não certifica segurança de distribuição.

Referência usada para as barreiras Electron: [documentação oficial de segurança](https://www.electronjs.org/docs/latest/tutorial/security).
