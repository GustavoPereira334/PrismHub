# Arquitetura híbrida do PrismHub

## Fluxo

Renderer → preload contextBridge → IPC validado → HardwareProcess (Main) → utilityProcess privado → HardwareService → HidManager ou OpenRGBClient.

Detalhes da revisão atual em desktop-features.md: timeout e encerramento do processo de hardware, perfis locais, diagnóstico sanitizado, atualização assinada e execução da interface como usuário comum. Os registros físicos anteriores continuam válidos somente para as revisões documentadas.

O Main Process conserva contextIsolation, sandbox e webSecurity ativos, nodeIntegration desativado, navegação e novas janelas bloqueadas e permissões negadas. Cada chamada IPC só é aceita a partir do frame principal da janela local carregada pelo aplicativo. O payload de iluminação é validado no IPC e novamente no serviço.

## Contrato de iluminação

A entrada aceita target (all, mouse, keyboard ou internal), color (#RRGGBB), brightness (inteiro de 0 a 100), effect (estatico, pulso, onda ou espectro) e speed (inteiro de 0 a 100, padrão 55). Um efeito só pode ser aplicado se todos os destinos selecionados o suportarem. Nos componentes OpenRGB, somente estatico está habilitado nesta entrega. Brilho é aplicado aos canais RGB; velocidade não tem efeito em uma cor estática.

O serviço prepara os dois provedores antes do primeiro envio. Os planos de escrita são criados no Main Process, vinculados ao gerenciador e nunca enviados ao renderer. A lista e a sessão OpenRGB precisam continuar válidas no momento da aplicação. Operações de aplicação concorrentes são recusadas. Encerrar o serviço cancela consultas enfileiradas e impede novos envios entre provedores e entre adaptadores; o G11 e o SDK também verificam cancelamento entre relatórios. Chamadas nativas síncronas em andamento não são interrompidas.

O resultado contém sent, confirmation, devices, uncertainDevices, warnings, errors e partial. sent conta os destinos cujos envios terminaram; não conta confirmação visual. Se um provedor falha depois que outro enviou comandos, partial é verdadeiro e os destinos já enviados são listados. Se apenas a preparação ou parte de um envio foi aceita, uncertainDevices identifica os destinos cujo estado precisa ser conferido, mesmo quando sent é zero. Falhas de transporte são isoladas por dispositivo: os demais adaptadores HID e o provedor OpenRGB continuam recebendo a configuração, salvo cancelamento ou encerramento do serviço. Não há rollback físico. Se o OpenRGB está indisponível ao preparar Todos, o envio aos periféricos pode continuar com um aviso explícito de que os componentes internos não receberam a configuração.

## OpenRGB

O cliente próprio usa node:net e o protocolo binário documentado. No desenvolvimento, conecta ao motor externo em 127.0.0.1:6742. No Windows empacotado, BundledOpenRGB inicia o executável oficial incluído em resources/openrgb usando spawn sem shell, sem janela, configuração isolada em userData/rgb-engine e porta privada em 127.0.0.1. O aplicativo usa lock de instância única e encerra somente seu próprio filho ao fechar normalmente. A descrição de controladores usa SDK 3, após negociação; versões inferiores são recusadas.

Mensagens ORGB têm cabeçalho de 16 bytes e campos inteiros little-endian. O cliente acumula fragmentos TCP, separa mensagens coalescidas, limita payloads a 8 MiB e a lista a 128 controladores, e valida os comprimentos internos. Requisições são serializadas porque o protocolo não fornece um identificador de transação por requisição. Timeout ou resposta inválida encerra a sessão e invalida todos os índices. A notificação DEVICE_LIST_UPDATED também limpa os índices imediatamente. As consultas periódicas tentam restabelecer a conexão sem iniciar processos externos.

Na camada SDK, os tipos motherboard, DRAM, GPU, cooler, LED strip, storage e case entram na lista interna. Keyboard (5) e mouse (6) podem entrar como fallback, com lightingTarget explícito no contrato da interface. Tipos desconhecidos não são roteados. Um adaptador HID disponível exclui os controladores SDK da mesma categoria para impedir envios duplicados, inclusive em identidades USB compostas ambíguas. Essa prioridade é por categoria, podendo excluir um segundo periférico da mesma categoria. Um destino nativo exclusivo não depende do SDK e não troca de provedor após falha.

RGB estático exige um modo Direct com a flag de cores por LED, além de contagens válidas. A aplicação usa SETCUSTOMMODE e UPDATELEDS. A exceção ENE DRAM AUDA0-E6K5-0101 usa UPDATEMODE com o modo Static anunciado e validado fisicamente. O cliente não redimensiona zonas nem envia comandos nativos SMBus/I2C. Controladores SDK sem a capacidade exigida e dispositivos Windows desconhecidos continuam visíveis sem controles inventados.

A validação física posterior confirmou iluminação parcial pela B550M AORUS ELITE após ajuste diagnóstico dos canais ARGB, e duas memórias ENE em Static. O fallback SDK de outros teclados e mouses foi validado com servidores simulados, sem enviar comandos físicos. Zonas e cadeias ARGB dependem do que o motor conhece; contagens lógicas não provam a quantidade de fans físicas.

## HID

HidManager mantém um registro de adaptadores específicos e seu destino (mouse ou keyboard). Sondagem retorna identidade e capacidades sem caminhos nativos. A preparação valida o efeito em todos os adaptadores selecionados. Cada adaptador continua responsável por seus filtros de interface/revisão e por seus relatórios. Somente o G11 integra o registro padrão, respaldado por docs/hardware/furycube-g11.md. X11 e SK80 ficam fora do caminho de produção até haver evidência física suficiente. Seus arquivos de pesquisa e testes de protocolo foram preservados. O fallback OpenRGB continua sujeito às capacidades anunciadas pelo SDK.

## Evolução

Novos adaptadores exigem identificação da interface, evidência do protocolo, validação dos parâmetros e registro de teste físico. Novos efeitos SDK devem respeitar as capacidades de cada controlador. O serviço atual coordena uma configuração comum; não é um motor de animações com sincronização temporal precisa. O instalador NSIS agrega o motor oficial, fontes e licenças, além do instalador PawnIO assinado, instalado apenas se ausente e nunca removido automaticamente. A interface agora usa asInvoker; hardware que exige privilégios adicionais pode ficar indisponível. A distribuição exige certificado do publicador e não foi gerada nesta revisão.

## Fontes técnicas

- SDK: https://gitlab.com/CalcProgrammer1/OpenRGB/-/blob/master/Documentation/OpenRGBSDK.md
- Tipos e flags: https://gitlab.com/CalcProgrammer1/OpenRGB/-/blob/master/RGBController/RGBControllerInterface.h
