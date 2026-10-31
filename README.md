# PrismHub

Novidades desta revisão: hardware em processo auxiliar com timeout, diagnóstico exportável sem identificadores privados, perfis locais por aplicativo e atualização com verificação criptográfica. Abra Configurações → Windows para os novos controles. DPI/polling físicos continuam bloqueados por falta de protocolo confirmado; distribuição e atualizações reais aguardam certificado e configuração de confiança. Detalhes em `docs/desktop-features.md`.

Central desktop RGB para Windows, com Electron e dois provedores de hardware:

- Periféricos: RGB HID do FuryCube G11 na revisão registrada. X11 e SK80 permanecem como pesquisa de protocolo, fora do registro de escrita de produção por falta de validação física documentada do PrismHub.
- Componentes internos e fallback de teclado/mouse: OpenRGB SDK local, para controladores que anunciam modo Direct e cores por LED. A revisão ENE DRAM AUDA0-E6K5-0101 usa Static, validado fisicamente.

## Executar

```powershell
npm ci
npm test
npm run check
npm run smoke:security
npm start
```

O projeto usa os módulos JavaScript nativos do Node.js e a interface HTML/CSS/JS existente, sem framework adicional. O ponto de entrada configurado no package.json é src/modules/main.js.

`smoke:security` abre uma janela Electron oculta com provedores inertes e diretório temporário. Verifica preload, isolamento, CSP, rejeição IPC, perfis locais, teclado e layouts; não conecta ao OpenRGB nem enumera hardware. Rejeições intencionais aparecem no terminal como erros dos handlers. Consulte `docs/security-hardening.md` para os contratos e limites desta revisão.

## OpenRGB

### Instalador único (Windows x64)

`npm run dist:win` exige primeiro certificado Windows e configuração de confiança para atualizações. Só depois prepara recursos verificados por SHA256 e gera o instalador assinado. Sem essas credenciais, falha antes da geração. O instalador pode exigir administrador; o aplicativo usa usuário comum (`asInvoker`). Componentes internos que precisam de privilégios adicionais podem ficar indisponíveis. Não exige Node.js nem OpenRGB instalado separadamente no computador de destino. Consulte `docs/desktop-features.md` para os requisitos de release.

O instalador inclui OpenRGB 1.1 não modificado e instala PawnIO oficial assinado apenas se ausente. Ao abrir a versão instalada, PrismHub inicia seu próprio motor sem janela, em uma porta privada restrita a 127.0.0.1, com configuração em sua pasta de dados. Ao fechar normalmente, encerra somente o processo que criou. Outro OpenRGB não é encerrado ou usado como motor da versão empacotada. Evite executar programas RGB concorrentes. Não são copiadas configurações locais de LEDs, perfis ou caminhos de dispositivos para outros computadores.

As fontes e licenças dos componentes redistribuídos acompanham o instalador em `resources/licensing`. Bibliotecas nativas usam os prebuilds Node-API oficiais x64; não exigem compilador no computador do usuário. O EXE do PrismHub não tem assinatura comercial, pois não foi fornecido certificado. O suporte a hardware de outros PCs continua dependente da compatibilidade e da configuração dos canais RGB. Fans apenas Molex continuam pelo botão.

### Desenvolvimento (`npm start`)

1. Abra o OpenRGB instalado separadamente e confira os componentes que ele detecta.
2. Ative o servidor SDK na porta 6742.
3. Abra o PrismHub. O cliente conecta somente a 127.0.0.1:6742; ele não instala nem inicia o OpenRGB ou drivers.
4. Em Iluminação RGB, selecione Componentes internos (OpenRGB), uma cor e o efeito Estático. Clique em Aplicar iluminação.

Teclado e mouse também usam o OpenRGB quando não há adaptador HID nativo disponível naquela categoria. Os destinos Teclado, Mouse e Todos selecionam apenas as respectivas categorias. Para impedir envios duplicados em dispositivos USB compostos, um adaptador nativo disponível tem prioridade sobre todos os controladores SDK da mesma categoria; não há troca automática de protocolo após erro de envio. Em um setup com dois teclados ou dois mouses, essa prioridade também pode excluir outro periférico da mesma categoria do fallback.

Dispositivos apenas detectados continuam visíveis sem controles RGB. Nenhum pacote HID genérico é enviado a modelos desconhecidos. O fallback oferece somente cor estática, depende do suporte real do OpenRGB e ainda precisa ser validado fisicamente em outros modelos. Em desenvolvimento o motor é externo; no instalador Windows ele é incluído e iniciado automaticamente.

Todos os dispositivos compatíveis aplica a mesma configuração aos periféricos HID e aos destinos SDK disponíveis. Apenas mouse e Apenas teclado usam adaptadores nativos ou o fallback SDK da categoria correspondente.

O protocolo negociado é SDK 3, inclusive ao conectar a servidores mais recentes. Servidores anteriores a SDK 3 ficam indisponíveis nesta primeira integração. O cliente tem limites de mensagem, validação de descrições, timeout, invalidação da lista e nova tentativa nas consultas periódicas. Se o OpenRGB não estiver disponível, os periféricos continuam utilizáveis e a interface informa o estado do motor.

Dispositivos SDK sem modo Direct compatível são exibidos como detectados, sem habilitar controles de cor; a exceção ENE validada usa Static conforme descrito acima.

## Estrutura

```text
src/
  modules/
    main.js                 Electron, ciclo de vida e encaminhamento de eventos
    ipcHandlers.js          Canais permitidos e validação do emissor
    openrgbClient.js         Sessão TCP local, descoberta e aplicação
    openrgbProtocol.js       Enquadramento e descrição binária SDK v3
    hidManager.js            Registro e seleção dos adaptadores HID
  hardware/
    hardware-service.js     Coordenação entre descoberta, HID e OpenRGB
    adapters/               Protocolos existentes de cada periférico
  preload/preload.cjs       API restrita via contextBridge
  shared/contracts.js       Normalização e validação de entradas
  renderer/index.html       Interface atual
  renderer/modules/         Controles, dispositivos e navegação
  ui/main.css               Estilos atuais
```

Os caminhos existentes de HTML/CSS foram preservados para manter uma única interface e conservar o trabalho local. O renderer não recebe sockets, acesso a node-hid, caminhos HID ou uma API IPC genérica.

## Limites desta entrega

- RGB estático e brilho nos dispositivos atendidos pelo SDK; efeitos genéricos animados ainda não são implementados pelo cliente SDK.
- Compatibilidade depende do OpenRGB instalado e de cada adaptador HID validado, não apenas de VID/PID ou marca.
- Fans em série são representadas pelo controlador e suas zonas/LEDs. O aplicativo não inventa quantas fans existem nem presume que compartilham canais independentes.
- Nenhum tamanho de zona, firmware, configuração de SMBus, DPI ou botão é alterado pela integração OpenRGB.
- Envio aceito pelo sistema/TCP não comprova mudança física nem simultaneidade exata entre dispositivos. A interface pede a conferência dos LEDs e informa falhas parciais.
- Testes automáticos de envio usam hardware/servidores simulados. Foram confirmadas fisicamente duas memórias ENE em Static e parte da iluminação ligada à placa-mãe; outros modelos de teclado/mouse via fallback ainda precisam de validação física.

Leia docs/architecture.md e docs/hardware/ para os contratos e registros dos adaptadores.
