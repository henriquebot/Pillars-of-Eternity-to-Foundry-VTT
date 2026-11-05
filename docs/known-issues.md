# Limitações e próximas ações — versão pública 0.1.8

O módulo ainda **não entrega uma campanha completa e pronta para jogar**. A versão 0.1.8 usa a base funcional da 0.1.6, com manifesto corrigido para Foundry v14.370. Ver [estado atual](current-status.md) para detalhes.

| Área | Evidência / situação | O que falta |
|---|---|---|
| Instalação/manifesto | Release pública 0.1.8 com URLs de `module.json` e `module.zip`, workflow de testes/publicação aprovado | Confirmar a versão 0.1.8 carregada no runtime local e fazer ensaio de atualização por manifesto |
| Extração e IR | Parsers de conversas, quests, stringtables e pacote intermediário com testes | Cobertura de todos os recursos reais do jogo e atribuição confiável de cada entidade |
| Mapas | Seis cenas do prólogo importadas; fundos visuais aprovados pelo GM | Paredes, luz, visão, navegação, portas, triggers, escala e combate ainda não homologados |
| Grade/fog/padding | Novos defaults no importador e testes independentes | Exercitar em cena nova e conferir comportamento efetivo para Player, sem retrofitar cenas legadas |
| Glimpse | Piloto com 3 Notes + 3 Journals no novo Encampment; exportação real e 3/3 idempotentes | Testes visuais, sessão Player, descoberta e spoilers, imagens/sons específicos, preservação manual real e lote de 10–20 |
| NPCs/creaturas | Perfis de narrativa; possível vínculo futuro com Actor | Tokens, estatísticas, encontros e automações D&D sem invenção de dados |
| Itens/loot/contêineres | IR/categorias distinguem recursos; preparação de equivalência D&D requer aprovação GM | Itens utilizáveis, saque persistente, comerciantes, quantidades, transferências e idempotência |
| Quests e lore | Textos estruturais e Journals parcialmente importáveis | Completar relações entre objetivos, estados e gatilhos; não executar scripts extraídos do jogo |
| Portais e segredos | Modelo/IR de posições, categorias e modos de descoberta | Condições reais, Regions/teleporte, travas, segredos e testes Player |
| Isometria/colisões | Calibração afim e mosaico de imagens com testes | Alinhamento de tokens, geometria de combate, iluminação, hitboxes e movimento |
| Segurança e permissão | Páginas GM separadas no piloto; inspeção documental | Provar isolamento de segredos em cliente Player real e verificar campos/flags públicos |
| Backup/reimportação | Conflitos e baseline protegidos no código e testes; 3 pins reais idempotentes | Ensaiar edição manual, falhas parciais e recuperação em mundo descartável |
| Integrações DAS/outros módulos | Há diagnóstico de presença/conflitos; Glimpse 1.3.0 ativo no piloto | Homologar combinações reais e versões, sem presumir que coexistência equivale a compatibilidade |
| Dados comerciais/distribuição | ZIP contém apenas código permitido; arquivos comerciais não são publicados | Extras/retratos/sons devem ser extraídos somente de instalação legítima e mantidos locais |

## Próxima entrega

1. Conferir via PowerShell/CDP versão realmente carregada e Glimpse API.
2. Validar os três cards da nova Encampment e testar privacidade como Player real, se houver acesso autorizado.
3. Testar edição manual + reimportação e, se aprovado, lote de 10–20 pins com dados e posições confiáveis.
4. Atualizar evidências e cobertura; não expandir as cinco outras cenas antes do piloto satisfatório.

A issue [#1 — Glimpse](https://github.com/henriquebot/Pillars-of-Eternity-to-Foundry-VTT/issues/1) acompanha o de-para. Não adicionar recursos comerciais, prints/logs de jogo ou dados privados ao GitHub.

**Não regredir a cena ou conteúdo aprovado.** Cenas já importadas e fatos confirmados não devem ser tratados como pendentes; validações que faltam não podem ser declaradas feitas.
