# Adaptação D&D 2024

A implementação `foundry/scripts/dnd-adapter.mjs` prepara uma cópia de um Item nativo a partir de um UUID de compêndio **instalado pelo usuário**, escolhido e aprovado pelo mestre. Ela preserva atividades/effects/dados do Item, registra nome original e decisão, remove ID de documento/flags de terceiros e mantém a indicação de validação real pendente. Não altera o compêndio nem cria documento automaticamente. Esta função é uma API de desenvolvimento, ainda não um fluxo completo do painel.

Itens sem correspondência permanecem pendentes. Não há biblioteca comercial embutida, procura automática por nomes parecidos, criação arbitrária de dano, cálculo validado de CR ou adaptação de monstros nesta versão. Homebrew deve ser produzido/revisado no sistema e referenciado por compêndio próprio. Criar uma descrição de arma sem atividade utilizável não conta como converter uma arma.

Exemplo de mapeamento de estrutura própria (o UUID é ilustrativo e não será resolvido sem compêndio real):

```json
{"approved":true,"uuid":"Compendium.meu-modulo.itens.Item.Abc123def456Gh78","decision":"Equivalente revisado pelo mestre; diferenças registradas na ficha"}
```

O sistema de atividades é parte do modelo nativo do dnd5e6. Para implementação/inspeção, consultar [Activities no repositório oficial](https://github.com/foundryvtt/dnd5e/wiki/Activities) e [AttackData em 6.0.x](https://github.com/foundryvtt/dnd5e/blob/6.0.x/module/data/activity/attack-data.mjs). Esses links explicam a estrutura; não comprovam validação deste módulo.

A adaptação narrativa coletiva do Watcher também permanece uma camada a implementar. A extração conserva as escolhas e consequências como dados inertes; não transforma automaticamente scripts de reputação/recompensa em alterações de mundo.
