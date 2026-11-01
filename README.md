# RPG UP — Pillars of Eternity → Foundry VTT

Importador local em desenvolvimento para **Pillars of Eternity 1 / The White March**, com alvo **Foundry V14.369, D&D 5e 6.0.x e regras 2024**. Interface PT-BR. O projeto não inclui mapas, textos de campanha, traduções comerciais ou arquivos de D&D protegidos.

**Estado: primeira implementação executável, aceitação final ainda pendente.** Já há scanner somente leitura, parsers XML estruturais de textos/quests/diálogos, IR versionado e pacotes compactos, catálogo de imagens por dimensões/hash, normalizador offline de referências públicas, calibração afim, módulo Foundry com painel GM, importação parcial de cenas/journals e testes independentes. Não houve importação da campanha comercial nem teste real do módulo dentro do Foundry.

```powershell
python tools/verify.py
python tools/build_release.py
$env:PYTHONPATH = (Join-Path $PWD 'extractor')
python -m rpgup_pillars scan --output local/scan.json
```

O scanner encontra instalações por Steam/GOG, bibliotecas secundárias e caminhos explícitos. Não usar arquivos de staging como instalação concluída. Dados extraídos e anotações de implantação permanecem locais, fora deste repositório.

Documentação:

- [Instalação e comandos](docs/installation.md), [manual Foundry](docs/foundry.md).
- [Arquitetura](docs/architecture.md), [IR](docs/intermediate-format.md), [formatos comprovados](docs/formats.md).
- [Auditoria das fontes](docs/source-audit.md), [viabilidade](docs/feasibility.md), [integrações](docs/integrations.md).
- [Referências públicas offline](docs/public-import.md), [adaptação D&D](docs/dnd-conversion.md).
- [Testes e evidências](docs/test-results.md), [validação real pendente](docs/validation.md).
- [Cobertura de conteúdo](docs/coverage.md), [limitações e próximos passos](docs/known-issues.md).
- [Requisitos originais do usuário](docs/project-brief.md).

Estrutura: `extractor/` Python; `foundry/` módulo; `schemas/` contrato; `tools/` build/relatórios; `tests/` fixtures próprias e testes; `local/` dados privados ignorados pelo Git; `dist/` ZIP instalável local.

O ZIP em `dist/` contém somente o módulo. Extrair para `<UserData>/Data/modules/rpgup-pillars-importer/`. Não há deploy automático nem release hospedada nesta etapa. Consulte as limitações antes de habilitar em qualquer mundo.

O workflow [Testes e build](https://github.com/henriquebot/Pillars-of-Eternity-to-Foundry-VTT/actions/workflows/ci.yml) executa a verificação em Windows/Linux e gera o ZIP como artefato quando aprovado. Os resultados locais publicados não substituem o resultado de cada execução do CI.
