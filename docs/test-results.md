# Resultados executados em 01/11/2026

Última execução completa: `python tools/verify.py`, exit code **0**.

| Suíte | Executados | Aprovados | Falhas |
|---|---:|---:|---:|
| Python (extrator, empacotador, catálogo e release/relatório) | 59 | 59 | 0 |
| Node (módulo, narrativa, geometria, D&D, referências públicas, manifesto e integração CLI) | 62 | 62 | 0 |
| **Total independente** | **121** | **121** | **0** |

Ambiente: Windows, Python **3.13.15**, Node **24.19.0**, sem dependências de runtime instaladas para estas suítes. As fixtures são próprias e sintéticas. O ensaio que cruza Python CLI → JSON compacto → consumidor Foundry usa essas fixtures e não o jogo comercial.

Foram executadas regressões de arquivos ausentes, Unicode, DTD/XML malformado, duplicatas, overlays, IDs, fallback de idioma, saídas proibidas na origem, limites do pacote, hash/dimensões de imagens, idempotência, backups, cancelamento de escrita, falhas parciais, conflitos com edições GM e separação entre dois contextos de mundo simulados.

O build local também foi executado: `python tools/build_release.py`. O teste do build verificou conteúdo por allowlist e igualdade do SHA-256 entre dois empacotamentos idênticos. O hash da release atual está em `dist/release.json`.

## Evidência real de ambiente, sem confundir com integração

- Setup de ambiente autorizado: versão **14 Build 369** observada na interface.
- Lista Sistemas: Dungeons & Dragons Fifth Edition **6.0.6** observado.
- Scanner real consultou 10 candidatos e identificou sinais de download Steam ainda em andamento, sem instalação final legível. Resultado em `local/scan.json`, ignorado pelo Git.
- Nenhuma extração de campanha comercial concluída. Os zeros de `docs/coverage.md` significam **nenhum conteúdo comercial processado**, não ausência de conteúdo no jogo.

**Ainda pendentes:** carregar nosso módulo no Foundry; criar/importar documentos reais; cliente jogador/permissões; carregamento e calibração dos mapas; movimentação, combate, iluminação, loot; dois mundos reais e módulos opcionais. Os testes com dublês de documentos não certificam esses comportamentos.

A cópia do módulo e a criação de um mundo descartável foram realizadas com autorização explícita. O manifesto foi entregue pelo servidor e o mundo chegou à gestão de usuários; o módulo ainda não foi habilitado ou validado em execução. Os registros e caminhos desse ambiente permanecem em anotações locais, fora do repositório público.
