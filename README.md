# Trufas do Miguel

Aplicativo web criado especialmente para ajudar o Miguel a organizar a venda de trufas na escola. O projeto simula a experiência de um aplicativo para celular, mas é desenvolvido como uma **PWA (Progressive Web App)**, podendo ser instalado e usado pelo Google Chrome em um aparelho Android.

## O que o sistema faz

- Cadastra, edita e remove sabores de trufas.
- Controla preços e quantidades em estoque por remessa.
- Registra cada pacote comprado, seu custo e a distribuição por sabor.
- Separa vendas e reservas por remessa, consumindo primeiro o pacote mais antigo (FIFO).
- Mostra quanto cada remessa vendeu, recebeu e ainda precisa recuperar do custo.
- Avisa quando restam cinco trufas ou menos no pacote.
- Monta pedidos com vários produtos.
- Registra o nome do cliente e observações.
- Reserva pedidos e permite confirmar o pagamento posteriormente.
- Aceita pagamentos em dinheiro ou PIX.
- Calcula automaticamente o troco em pagamentos em dinheiro.
- Gera QR Code e código copia e cola para pagamentos via PIX.
- Exibe o histórico completo ou filtrado por remessa e forma de pagamento.
- Registra perdas e correções de estoque com remessa, sabor, quantidade e motivo.
- Exporta e importa backups dos produtos, pedidos, configurações e remessas.
- Funciona offline após o primeiro carregamento.

## Como os dados são armazenados

Este projeto não possui servidor, login ou banco de dados online. Produtos, estoque, pedidos, configurações e remessas ficam salvos no `localStorage` do navegador do próprio celular.

As chaves utilizadas são `truffles_mig`, `orders_mig`, `settings_mig` e `batches_mig`. O estoque total exibido no cardápio é recalculado a partir das unidades disponíveis em cada remessa.

Na primeira abertura desta versão, o aplicativo apresenta uma conferência guiada para criar a **Remessa 1**. Pedidos, reservas, estoque e preços históricos são preservados; somente os preços atuais do cardápio passam para R$ 2,00. Backups antigos continuam aceitos e passam pela mesma conferência.

Por isso, é importante exportar backups regularmente. Limpar os dados do Chrome, desinstalar a PWA ou trocar de aparelho pode apagar as informações armazenadas localmente.

## Tecnologias

- HTML, CSS e JavaScript puros
- Web App Manifest
- Service Worker e Cache API
- `localStorage`
- QRCode.js para gerar o QR Code do PIX
- Google Fonts

## Estrutura do projeto

```text
.
├── index.html       # Estrutura principal da interface
├── css/
│   ├── base.css     # Reset, variáveis, tipografia e base global
│   ├── shell.css    # Estrutura do app, telas, cabeçalho e áreas roláveis
│   ├── sales.css    # Home, cardápio, carrinho, resumo e sucesso
│   ├── admin.css    # Administração de sabores
│   ├── overlays.css # Modais, toast, QR Code e elementos sobrepostos
│   ├── settings.css # Tela de configurações
│   ├── orders.css   # Histórico, filtros e detalhes de pedido
│   └── batches.css  # Remessas, métricas, ajustes e migração guiada
├── js/
│   ├── constants.js # Dados iniciais do cardápio
│   ├── storage.js   # Chaves, leitura/gravação segura e backup do localStorage
│   ├── utils.js     # Formatação, sanitização e conversões simples
│   ├── domain.js    # Regras de remessas, estoque, indicadores e alocação FIFO
│   ├── backup.js    # Validação e normalização de backups importados
│   └── app.js       # Estado da tela, navegação, formulários e renderização
├── manifest.json    # Configurações de instalação da PWA
├── sw.js            # Cache e funcionamento offline
├── icon.svg         # Ícone do aplicativo
└── AGENTS.md        # Orientações para agentes que alterarem o projeto
```

O projeto continua sem framework, sem etapa de build e sem dependências instaladas por terminal. Os scripts são carregados diretamente pelo navegador nesta ordem: `constants.js`, `storage.js`, `utils.js`, `domain.js`, `backup.js` e `app.js`.

## Executando localmente

A PWA precisa ser aberta por HTTP; não abra o `index.html` diretamente pelo gerenciador de arquivos.

Com Python instalado, execute na pasta do projeto:

```bash
python3 -m http.server 8080
```

Depois, abra `http://localhost:8080` no navegador do computador.

Para testar em um celular Android conectado à mesma rede Wi-Fi, use o endereço IP do computador, por exemplo:

```text
http://192.168.0.10:8080
```

> Alguns recursos de PWA e o Service Worker exigem HTTPS fora de `localhost`. Para uso real no Android, publique o projeto em uma hospedagem HTTPS.

## Instalação no Android

1. Abra o endereço publicado no Google Chrome.
2. Toque no menu de três pontos.
3. Escolha **Adicionar à tela inicial** ou **Instalar app**.
4. Confirme a instalação.

O sistema abrirá em uma janela própria, com aparência semelhante à de um aplicativo Android.

## Observações importantes

- O sistema foi pensado para uso pessoal e em um único aparelho.
- Ele é uma simulação de aplicativo: não foi desenvolvido como aplicativo Android nativo.
- Não existe sincronização automática entre dispositivos.
- Uma venda pode usar mais de uma remessa. A origem de cada unidade fica gravada no pedido para que exclusões devolvam o estoque corretamente.
- O lucro acumulado considera apenas pagamentos confirmados e desconta o custo de todas as remessas compradas.
- O formato atual de backup é a versão 2 e inclui as remessas e seus ajustes.
- O pagamento PIX é apenas registrado pelo sistema; a confirmação real deve ser verificada no aplicativo do banco.
- Sempre valide o funcionamento offline e a instalação depois de alterar o manifesto ou o Service Worker.

## Objetivo

Oferecer ao Miguel uma ferramenta simples, rápida e fácil de usar durante as vendas na escola, substituindo anotações em papel e facilitando o controle de estoque, pedidos e pagamentos.
