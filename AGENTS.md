# AGENTS.md

Este arquivo orienta agentes de IA que forem trabalhar no projeto **Trufas do Miguel**.

## Contexto do produto

O sistema foi criado para o irmão do proprietário do repositório, que vende trufas na escola. Ele será usado principalmente em um celular Android. É uma PWA que simula a experiência de um aplicativo instalado, e não um aplicativo Android nativo.

Priorize sempre:

1. Uso rápido com uma mão durante as vendas.
2. Interface simples, legível e adequada a telas pequenas.
3. Segurança dos pedidos e do estoque já armazenados no aparelho.
4. Funcionamento no Google Chrome para Android e no modo PWA instalado.
5. Funcionamento offline depois do primeiro acesso.

## Arquitetura atual

- `index.html`: contém toda a marcação, os estilos e o JavaScript da aplicação.
- `manifest.json`: define nome, ícone, cores, orientação e comportamento de instalação.
- `sw.js`: registra o cache necessário para uso offline.
- `icon.svg`: ícone da PWA.
- Não há framework, etapa de build, backend, autenticação ou banco de dados remoto.
- Os dados persistentes usam as chaves `truffles_mig`, `orders_mig` e `settings_mig` no `localStorage`.

Mantenha essa arquitetura enxuta, salvo quando o usuário pedir explicitamente uma mudança estrutural.

## Regras para alterações

- Não transforme o projeto em React, Vue, Angular ou outro framework sem solicitação explícita.
- Não adicione backend, conta de usuário, sincronização em nuvem ou dependências pesadas sem autorização.
- Preserve a compatibilidade com dados já existentes no `localStorage`.
- Se o formato dos dados mudar, implemente uma migração retrocompatível. Nunca apague dados silenciosamente.
- Ao excluir um pedido reservado, preserve a regra de devolver seus itens ao estoque.
- Ao confirmar ou reservar um pedido, evite estoque negativo e duplicidade de baixa.
- Trate todo texto digitado pelo usuário como não confiável antes de inseri-lo em HTML.
- Mantenha textos visíveis em português do Brasil e valores em reais (`R$`).
- Garanta alvos de toque confortáveis e não dependa apenas de `hover`.
- Respeite `safe-area-inset`, altura dinâmica do Chrome e orientação vertical.
- Não confunda a geração do QR Code PIX com confirmação bancária: o sistema não consulta o banco.
- Não inclua segredos, chaves privadas ou dados pessoais reais no repositório.

## PWA e cache

O Service Worker usa cache para os arquivos locais. Quando uma alteração precisar chegar aos aparelhos que já instalaram a PWA, atualize o identificador da constante `CACHE` em `sw.js` (por exemplo, de `trufas-mig-v2` para `trufas-mig-v3`).

Ao modificar a PWA:

- Confirme que `manifest.json` continua válido.
- Confirme que os caminhos funcionam quando o projeto é publicado em uma subpasta.
- Teste uma instalação nova e uma atualização sobre uma instalação existente.
- Teste a abertura sem internet depois de visitar o sistema pelo menos uma vez.
- Evite armazenar respostas inválidas ou páginas de erro no cache.

## Validação mínima antes de concluir

Execute ou confira, conforme o alcance da mudança:

1. A página abre sem erros no console.
2. É possível adicionar, editar e excluir uma trufa.
3. Estoque e preços persistem após recarregar a página.
4. Um pedido pode ser confirmado por PIX e por dinheiro.
5. O cálculo de troco está correto.
6. Uma reserva baixa o estoque e pode ter o pagamento confirmado depois.
7. Excluir uma reserva devolve os itens ao estoque apenas uma vez.
8. Filtros, totais e histórico de pedidos continuam corretos.
9. Exportação e importação de backup preservam produtos, pedidos e configurações.
10. A interface funciona em uma largura próxima de 360 px e no Chrome para Android.
11. A PWA abre instalada e continua utilizável offline.

Se não for possível testar em um Android real, informe isso claramente ao entregar a alteração e faça pelo menos uma simulação de viewport móvel no navegador.

## Estilo de implementação

- Faça mudanças pequenas e focadas.
- Reutilize componentes visuais e variáveis CSS existentes.
- Prefira JavaScript nativo e APIs web amplamente suportadas pelo Chrome para Android.
- Comente apenas regras que não sejam evidentes pelo código.
- Não altere dados iniciais, identidade visual ou regras comerciais sem solicitação.
- Atualize o `README.md` quando uma mudança alterar instalação, uso, armazenamento ou funcionalidades.
