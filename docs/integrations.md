# Perfis de integração — evidência e pendências

Consulta: 01/11/2026. Compatibilidade declarada pelo autor não equivale a teste executado pelo RPG UP. O funcionamento básico do importador não requer estes módulos. Não se modifica configuração ou código de terceiros automaticamente.

| Perfil | Componentes | Restrições verificadas |
|---|---|---|
| Nativo | Foundry14 + dnd5e6.0.x | Referência para validar importação e permissões sem automação extra |
| DAS | `dnd5e-combat`, opcional `darsh-dnd-ui`; loot nativo ou `darsh-loot` após teste | Core declara conflito com Midi-QOL; `darsh-loot` declara conflito com Item Piles |
| Midi | Midi-QOL + DAE nas versões correspondentes, CAT quando necessário, CPR no canal compatível | Core DAS precisa estar inativo; versões e comportamento de CPR2.1.x pré-release precisam ser testados |

[Core DAS](https://github.com/Darshyne/dnd5e-combat) e [UI](https://github.com/Darshyne/darsh-dnd-ui) são projetos MIT; os READMEs também atribuem material SRD5.2 à licença CC-BY4.0. O projeto se declara beta. [Core README](https://raw.githubusercontent.com/Darshyne/dnd5e-combat/main/README.md) apresenta API em `game.modules.get('dnd5e-combat').api`, cadastro por identificador dnd5e via `api.content.register(source, table)` e hook `dnd5e-combat.registerContent`. Identificadores estáveis são preferíveis a nome traduzido. Algumas automações do autor leem descrições apenas em inglês/francês e retornam ao comportamento nativo em outros idiomas; PT-BR exige ensaio próprio. Nada foi registrado ou executado pelo RPG UP.

[Manifesto Core consultado](https://raw.githubusercontent.com/Darshyne/dnd5e-combat/main/module/module.json): versão0.258.0, Foundry mínimo14/verificado14.369, dnd5e mínimo6.0.0/verificado6.0.6. Além do conflito com `midi-qol`, lista `automated-conditions-5e`, `enhancedcombathud`, `enhancedcombathud-dnd5e` e `combat-tracker-dock`. [Manifesto UI](https://raw.githubusercontent.com/Darshyne/darsh-dnd-ui/main/module/module.json): versão0.27.1, Core mínimo0.146.0; conflitos com `bg3-hud-core`, `combat-tracker-dock`, `party-monitor-dock`. Não basta trocar nomes do HUD para obter integração.

[DAS Loot](https://github.com/Darshyne/darsh-loot) declara contêineres, comércio e corpos saqueáveis, usa API do Core e substitui Item Piles. Conteúdo aleatório próprio desse provedor não deve substituir o loot original do jogo durante importação. O importador precisa definir conteúdo/estado explicitamente e respeitar o inventário persistido. API específica de criação/atualização de contêineres ainda não foi analisada nem chamada.

[CAT GitHub](https://github.com/chrisk123999/covens-automation-toolkit), [wiki](https://github.com/chrisk123999/covens-automation-toolkit/wiki) e [catálogo](https://foundryvtt.com/packages/cat) identificam uma API baseada em Midi, sem automações prontas. [CPR GitHub](https://github.com/chrisk123999/chris-premades) é o pacote de recursos. Seu [catálogo estável](https://foundryvtt.com/packages/chris-premades) limita a release 1.5.51 a V13; as [releases oficiais](https://github.com/chrisk123999/chris-premades/releases) também incluem 2.1.x pré-release. O [template atual](https://raw.githubusercontent.com/chrisk123999/chris-premades/main/module-template.json) declara V14/dnd5e mínimo 6.0.0/verificado 6.0.6 e Midi≥14.6.0, DAE≥14.6.0, CAT≥0.1.3; um template não fixa os requisitos de cada release anterior. Não declarar compatibilidade ou incompatibilidade de toda a família pela página de um único canal.

[Changelog Midi dnd6](https://gitlab.com/tposney/midi-qol/-/raw/dnd6/Changelog.md) registra pares específicos: 14.6.1 requer Foundry14.369/dnd5e6.0.6/DAE14.6.1; 14.6.5 restringe dnd5e6.0.x e requer DAE14.6.4. O instalador deve diagnosticar versões e manter a automação opcional. Não criar flags Midi/DAE/CAT ou conteúdo executável a partir de scripts extraídos do jogo.

Para testar, registrar os módulos e versões exatos num mundo descartável e executar separadamente cada perfil. Confirmar ataque/alcance/movimento/visão em perspectiva; conferir transferência de loot, atualização idempotente, conta de jogador e estados independentes dos dois mundos. Não marcar uma cena como validada a partir da simples instalação de Isometric Perspective ou DAS.

