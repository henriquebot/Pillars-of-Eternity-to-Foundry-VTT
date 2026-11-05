# Plano de validação e evidências

Referência operacional: [estado atual](current-status.md). Desenvolvimento em **Foundry Desktop 14.370**, **dnd5e 6.0.6**, **Glimpse 1.3.0**, mundo **`rpgup-pillars-tests`**. Código público na release **0.1.8**; a versão efetivamente carregada precisa ser verificada em cada sessão.

## Já demonstrado

- O console CDP via PowerShell executa JavaScript no Foundry autenticado como GM, sem controle da interface gráfica.
- O importador criou as seis novas cenas do prólogo; a aparência dos fundos foi conferida pelo GM. A posição/estrutura de mosaicos de Valewood e Gilded Vale foi corrigida.
- Piloto Glimpse no novo Encampment: **3 Notes, 3 Journals**, exportação confirmada, **3/3 unchanged** na reimportação e nenhuma duplicação detectada.
- **Validação visual manual como Player concluída pelo usuário:** relatou enxergar somente o conteúdo esperado. Não repetir o teste nesta fase. Trata-se de uma checagem de visibilidade de usuário, **não** auditoria automatizada de flags, rede ou todas as transições de descoberta.
- Testes independentes: **82 Python e 104 Node** aprovados na base 0.1.6; release 0.1.8 publicada via CI.

## Próximos testes de aceitação

1. Verificar `-Probe` com a release mais recente realmente carregada: versão, GM, mundo e API do Glimpse. Não confundir versão no Git com runtime.
2. Conferir **visualmente** no novo Encampment os três cards, posição, ícone, textos, fatos, imagens, comportamento de hover/abertura e eventuais 404. Usar CDP com autorização; registrar limitações se não for possível obter captura fiel.
3. **Teste de visibilidade como Player dispensado de repetição:** o usuário já conferiu e aprovou o conteúdo visível. Não abrir novo Player nem solicitar credenciais. Auditar descoberta, fog/visão ou dados transmitidos somente se for necessário por novo requisito ou regressão concreta.
4. Fazer edição manual controlada de um pin/journal do lote, reimportar e demonstrar preservação ou conflito explícito sem sobrescrita.
5. Inspecionar mídia: somente imagens e sons originais associados com segurança. Sem inventar retratos, sons ou dados.
6. Se o piloto estiver satisfatório, tentar até **10–20 novos pins** só com IDs, textos e coordenadas verificáveis. `locations.plan` antes de `apply`, depois `locations.export`; verificar latência, posições, duplicação e reimportação.
7. Somente após aceitação, expandir o fluxo para outras cenas do prólogo. Sem habilitar funcionalidades de combate sem paredes, distância, iluminação, colisão e movimento realmente testados.
8. Futuramente: segundo mundo de teste, autenticação separada, quests e estado de mundo, backups/recuperação, combinações DAS e outros módulos.

## Restrições

- Nada de alteração em mundo de produção, cinco cenas não alvo do piloto, Encampment antiga ou dados do GM fora do lote.
- Inventariar antes das escritas, backup, `plan/apply/export`, reimportação idempotente.
- Recursos comerciais, dados de jogadores, links privados, dumps, credenciais, capturas e evidências ficam **fora do GitHub**, em `local/validation/` quando aplicável.
- Testes independentes usam fixtures e mocks e **não** certificam a segurança das permissões reais nem o comportamento dos módulos de terceiros. A checagem manual do usuário como Player comprova apenas a visibilidade observada por ele, não toda a superfície técnica de privacidade.

Registrar sempre resultados positivos, falhas, versões efetivamente carregadas, alvos de escrita e pendências com evidência. Referência dos resultados: [test-results.md](test-results.md).
