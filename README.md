# Trufas do Miguel

Aplicativo web criado especialmente para ajudar o Miguel a organizar a venda de trufas na escola. O projeto simula a experiência de um aplicativo para celular, mas é desenvolvido como uma **PWA (Progressive Web App)**, podendo ser instalado e usado pelo Google Chrome em um aparelho Android.

## O que o sistema faz

- Cadastra, edita e remove sabores de trufas.
- Controla preços e quantidades em estoque.
- Monta pedidos com vários produtos.
- Registra o nome do cliente e observações.
- Reserva pedidos e permite confirmar o pagamento posteriormente.
- Aceita pagamentos em dinheiro ou PIX.
- Calcula automaticamente o troco em pagamentos em dinheiro.
- Gera QR Code e código copia e cola para pagamentos via PIX.
- Exibe o histórico de pedidos e o total arrecadado.
- Exporta e importa backups dos produtos, pedidos e configurações.
- Funciona offline após o primeiro carregamento.

## Como os dados são armazenados

Este projeto não possui servidor, login ou banco de dados online. Produtos, estoque, pedidos e configurações ficam salvos no `localStorage` do navegador do próprio celular.

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
├── index.html      # Interface, estilos e regras do sistema
├── manifest.json   # Configurações de instalação da PWA
├── sw.js           # Cache e funcionamento offline
├── icon.svg        # Ícone do aplicativo
└── AGENTS.md       # Orientações para agentes que alterarem o projeto
```

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
- O pagamento PIX é apenas registrado pelo sistema; a confirmação real deve ser verificada no aplicativo do banco.
- Sempre valide o funcionamento offline e a instalação depois de alterar o manifesto ou o Service Worker.

## Objetivo

Oferecer ao Miguel uma ferramenta simples, rápida e fácil de usar durante as vendas na escola, substituindo anotações em papel e facilitando o controle de estoque, pedidos e pagamentos.
