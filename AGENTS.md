# Instruções de trabalho — RPG UP Pillars → Foundry

**Antes de executar tarefas**, leia `README.md`, [`docs/current-status.md`](docs/current-status.md), `docs/validation.md` e `docs/known-issues.md`. O escopo autorizado está em `docs/project-brief.md`; a integração Glimpse é acompanhada na issue #1. **Estado atual: release pública 0.1.8, alvo Foundry v14.370 + dnd5e 6.0.x.** Não confundir release no GitHub com versão efetivamente carregada no Foundry.

## Trabalho local e segurança

- Antes de sincronizar, executar `git status` e comparar `origin/main`; o workspace local pode conter alterações adicionais, ainda não commitadas. **Não apagar nem sobrescrever trabalho local** por `reset --hard`, `clean -fd`, checkout forçado ou cópia cega de pastas. Preservar `local/`.
- Nunca escrever na instalação original do Pillars/Steam. Recursos comerciais, extração, IR real, credenciais, dumps, screenshots e evidências com dados privados ficam em `local/` ignorado pelo Git ou fora do repositório; não entram no ZIP nem na release.
- Usar apenas evidências de execução comprovadas: testes unitários com dublês não validam comportamento real; não inventar coordenadas, conteúdo do jogo, traduções, imagens, sons, descobertas ou compatibilidade.
- Não alterar mundos de produção, outros mundos nem dados não relacionados. Mundo autorizado para piloto: `rpgup-pillars-tests`. Inventariar alvos e criar backup antes de qualquer escrita; não excluir automaticamente dados do GM.
- Preservar IDs, proveniência, páginas privadas, progresso de mundo, campos manuais e estados de descoberta/visita; reimportação deve ser idempotente.
- APIs e comportamento do Foundry v14 usam Level para fundos. A presença de módulos terceiros não prova compatibilidade nem autoriza mudança da configuração.

## Automação Foundry: CDP obrigatório

- Preferir `tools/foundry-console/Invoke-FoundryCdp.ps1` e seu `-Probe` para diagnosticar/operar o Foundry Desktop já aberto como GM. Verificar versão, mundo, GM, importer efetivamente carregado e Glimpse antes de agir.
- **Não usar F12, controle da tela, mouse, teclado, screenshot por automação visual nem reiniciar o Foundry por conveniência.** Capturas via protocolo CDP em sessão autorizada são diferentes de controlar a interface do usuário.
- Ambiente Codex pode negar socket local no sandbox: pedir autorização formal para a operação específica, respeitando escopo de leitura/escrita. Se recusado, fornecer um comando PowerShell ao usuário, sem contornar a restrição.
- O CDP é o canal de comunicação; não executar scripts de origem comercial, não rodar `eval` de dados não confiáveis e não usar a Oracle ou servidores remotos neste projeto sem autorização explícita.

## Etapa de desenvolvimento atual: Glimpse

- Seis imagens de cenas foram aprovadas visualmente pelo GM. Não reconstruir ou alterar essas cenas sem motivo comprovado. A nova Encampment contém piloto com **3 Glimpse Notes e 3 Journals**, 3/3 idempotentes.
- **Validação de visibilidade como Player concluída manualmente pelo usuário:** ele confirmou que enxergou somente o conteúdo esperado. **Não repetir essa checagem nem solicitar novo login Player.** Próximo passo: homologar cards/posições por CDP, revisar mídia e testar preservação de edição manual; depois, lote de Encampment com dados/posições confiáveis. Demais cinco cenas ficam inalteradas.
- Para Glimpse, preferir `locations.plan()` → `locations.apply()` → `locations.export()`; manifesto derivado do IR, sem conteúdo secreto em campos públicos. Os pins/journals anteriores ao novo piloto são fixtures descartáveis, não fazem parte do contrato de migração.
- A conferência de visibilidade do Player foi relatada e aprovada pelo usuário; registrar como **validação manual do usuário**, não como auditoria técnica automatizada de flags/rede. Não criar credenciais Player nem repetir o teste já realizado; investigar permissões novamente apenas se surgir regressão concreta.

## Qualidade, documentação e release

- Rodar `python tools/verify.py` e `python tools/build_release.py` após mudanças relevantes; registrar contagens de testes e evidências reais sem alegar validações não feitas. A base 0.1.6 passou 82 testes Python e 104 Node; build com 14 arquivos sem recursos comerciais.
- Para código novo: ajustar `foundry/module.json`, incrementar versão **somente após verificação**, sincronizar com GitHub sem perder trabalho local, acompanhar GitHub Actions e confirmar `module.json` + `module.zip` publicados. A versão atual da release é **v0.1.8**. Alterações só em documentação não exigem bump.
- Nunca inventar URLs nem assumir que um link `blob/main` funciona como manifesto de instalação. Manifesto: `https://github.com/henriquebot/Pillars-of-Eternity-to-Foundry-VTT/releases/latest/download/module.json`.
- Ao concluir tarefas, informar concisamente o que foi feito, o que foi realmente testado, a versão carregada, o que falta e qualquer autorização/bloqueio. Sem promessa de execução posterior.

`local/validation/` guarda detalhes privados do ambiente e autorizações específicas; consulte se disponíveis. A autorização já dada continua válida em seu escopo, mas uma autorização CDP de leitura não permite escritas.
