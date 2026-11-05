# Estado atual e próxima tarefa (05/11/2026)

Este arquivo é o ponto de partida operacional para o Codex. Leia também [`AGENTS.md`](../AGENTS.md), [`docs/validation.md`](validation.md), [`docs/known-issues.md`](known-issues.md) e o [backlog Glimpse #1](https://github.com/henriquebot/Pillars-of-Eternity-to-Foundry-VTT/issues/1). Distinguir sempre **código publicado**, **runtime carregado** e **resultado de teste**.

## Plataforma e release

- Release pública: **v0.1.8**, via [releases/latest/download/module.json](https://github.com/henriquebot/Pillars-of-Eternity-to-Foundry-VTT/releases/latest/download/module.json). Código funcional da linha 0.1.6, com correções de metadados do manifesto e `compatibility.verified: "14.370"`.
- Ambiente de desenvolvimento/teste: **Foundry Desktop v14.370**, D&D 5e **6.0.6**, mundo isolado `rpgup-pillars-tests`; **Glimpse Map Notes 1.3.0** ativo no piloto.
- O último runtime efetivamente confirmado por CDP durante o piloto ainda carregava **0.1.5**; o adaptador 0.1.6 foi executado no Foundry via CDP. **Não afirmar que o runtime está em 0.1.8 sem novo probe.**
- A pipeline pública aprovou a publicação 0.1.8. O teste local da base 0.1.6 terminou com **82 Python + 104 Node**, além do build de 14 arquivos sem assets comerciais. CI independente não equivale a homologação total no Foundry.

## Cenas e Glimpse

- Seis cenas do prólogo foram importadas para a pasta nova `Pillars of Eternity — Prólogo`: Encampment; Cilant Lîs Interior; Cilant Lîs Exterior; Valewood; Bear Cave; Gilded Vale. Valewood e Gilded Vale tiveram mosaicos corrigidos; o GM considerou as seis imagens corretas. A Encampment antiga com Notes legados não é alvo da nova importação.
- Configuração padrão **para cenas novas** no importador: grade quadrada **150 px**, padding **0.1**, fundo **#000000** e comportamento explícito de visão/fog por modalidade de exploração; preservar edições do GM em reimportações e não alterar cenas legadas.
- Piloto Glimpse na **nova Encampment**: **3 Notes + 3 Journals**, categorias NPC/examinável/recurso, `locations.export()` confirmado, **3/3 unchanged** na reimportação, sem duplicação. Journals têm conteúdo público e página de GM separada. **O usuário já conferiu manualmente a sessão como Player e confirmou que só aparecia o conteúdo esperado.** Não repetir esta checagem; isso não comprova auditoria técnica de todas as flags/transportes.
- Pendências do piloto: inspeção visual dos cards e posições; imagens específicas e sons com associação segura; teste de 10–20 pins apenas quando houver dados e coordenadas confiáveis; conflitos e edições manuais; não expandir para outras cenas sem homologar Encampment. **Visibilidade de conteúdo como Player foi aprovada manualmente pelo usuário; não agendar repetição desse teste.** Estados de descoberta e detalhes técnicos não foram informados como testados.

## Fluxo de execução do Codex

1. Conferir `git status` e comparar com `origin/main` antes de sincronizar. **Preservar alterações locais**; não usar `git reset --hard`, `git clean -fd` nem sobrescrever `local/`. A release 0.1.8 já foi publicada; não duplicar a publicação.
2. Inspecionar o runtime com `tools/foundry-console/Invoke-FoundryCdp.ps1 -Probe`; validar mundo, GM, versão efetivamente carregada e disponibilidade da API do Glimpse. O helper CDP foi testado no PowerShell 5.1 e 7; se a sandbox bloquear o socket local, solicitar autorização formal para a operação específica. Não usar F12, mouse/teclado ou automação visual.
3. Antes de escritas, inventariar documentos-alvo, criar backup, pré-visualizar com `locations.plan`, delimitar o lote e registrar evidências. Não alterar outros mundos ou cinco cenas restantes; a verificação manual de Player já foi realizada pelo usuário e não deve ser repetida nesta etapa.
4. Homologar os 3 pins existentes. Para inspeção visual, preferir captura via CDP/sessão de teste autorizada; se não for tecnicamente possível, registrar a limitação e fornecer um roteiro curto de inspeção ao GM.
5. Somente então avaliar lote adicional de Encampment com fontes originais rastreáveis, coordenadas verificadas, `plan/apply/export`, idempotência, proteção a spoilers e respeito às edições manuais.
6. Rodar `python tools/verify.py` e `python tools/build_release.py` após mudanças relevantes; manter `local/validation/` privado, atualizar documentação pública com **somente** contagens, versões e resultados comprovados.

## Distribuição

- `foundry/module.json` é a fonte de verdade da versão. A workflow `.github/workflows/publish-module.yml` publica `module.json` e `module.zip` quando há novo número de versão em `main`; ela não deve republicar releases existentes.
- **Não elevar a versão** para alterações apenas de documentação. Para código novo, testar e rever o ZIP, confirmar ausência de arte/texto/áudio comercial, aumentar versão e só então publicar. Conferir release e URLs reais antes de anunciar instalação.
- Conteúdo do jogo, extratos de `local/`, screenshots, dumps, logs de sessão e outros recursos privados/comerciais ficam fora do Git.

## Critério para próxima entrega

Uma avaliação objetiva da nova Encampment, com inspeção dos três cards em execução, **sem repetir o teste de visibilidade Player já aprovado pelo usuário**, teste de reimportação após edição manual e relatório sobre a segurança de iniciar um lote de pins. Não afirmar auditoria técnica de flags/rede ou estados de descoberta sem evidências específicas.
