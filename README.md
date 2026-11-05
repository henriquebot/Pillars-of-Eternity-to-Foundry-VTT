# RPG UP — Pillars of Eternity → Foundry VTT

Ferramentas de extração e importação local de **Pillars of Eternity 1 / The White March** para **Foundry VTT v14 (referência de desenvolvimento: 14.370)**, com **D&D 5e 6.0.x / regras 2024**. Interface PT-BR.

> **Estado do repositório:** o código público ainda identifica o módulo como **0.1.0** e não corresponde integralmente à versão **0.1.6** desenvolvida e testada localmente. Os testes locais do importador 0.1.6 em Foundry 14.370, incluindo um piloto com Glimpse, **não homologam automaticamente** o código público 0.1.0. Não utilizar este repositório como uma release pronta da campanha.

O projeto pesquisa a conversão de mapas pré-renderizados, textos, quests, NPCs, itens e pontos de interesse para cenas, journals e outros recursos do Foundry. O foco é um pipeline reutilizável, com dados intermediários versionados, origem rastreável e reimportação controlada. A conversão não equivale a uma campanha completa e pronta para combate.

**O repositório não distribui mapas, imagens, áudio, textos comerciais, traduções protegidas nem dados da instalação de Pillars.** Recursos extraídos de uma cópia legítima devem permanecer localmente, fora do Git.

## Manifesto e instalação

O manifesto-fonte está em [`foundry/module.json`](foundry/module.json). O instalador de módulos do Foundry requer **um manifesto remoto e um ZIP de módulo publicados juntos**.

A URL de instalação prevista para uma **release publicada** é:

```text
https://github.com/henriquebot/Pillars-of-Eternity-to-Foundry-VTT/releases/latest/download/module.json
```

**Atenção:** ainda **não há release publicada** no GitHub. Por enquanto, essa URL não permite instalar o módulo. Não confundir o arquivo-fonte do manifesto com uma publicação instalável.

O workflow [Publicar módulo Foundry](.github/workflows/publish-module.yml) foi preparado para executar testes e publicar `module.json` e `module.zip` quando uma tag de versão compatível com o manifesto for enviada. **Antes de publicar**, sincronizar com o GitHub o código local mais recente, atualizar `foundry/module.json` e conferir a ausência de arquivos comerciais. Para instalação de desenvolvimento, use [as instruções locais](docs/installation.md).

## Desenvolvimento

Requisitos: Python 3.11+ e Node.js 22+.

```powershell
python tools/verify.py
python tools/build_release.py
$env:PYTHONPATH = (Join-Path $PWD 'extractor')
python -m rpgup_pillars scan --output local/scan.json
```

O scanner reconhece instalações por Steam/GOG, bibliotecas adicionais e caminhos explícitos. Não escreve na instalação original. Dados extraídos, inventários de arquivos do jogo e relatórios privados ficam em `local/`, ignorado pelo Git.

Estrutura: `extractor/` (Python), `foundry/` (módulo), `schemas/` (IR), `tools/` (build e diagnósticos), `tests/` (fixtures próprias), `docs/` (documentação).

## Documentação

- [Instalação](docs/installation.md) e [manual do Foundry](docs/foundry.md).
- [Arquitetura](docs/architecture.md), [IR](docs/intermediate-format.md) e [formatos comprovados](docs/formats.md).
- [Auditoria das fontes](docs/source-audit.md), [viabilidade](docs/feasibility.md) e [integrações](docs/integrations.md).
- [Referências públicas](docs/public-import.md) e [adaptação para D&D](docs/dnd-conversion.md).
- [Testes](docs/test-results.md), [validação](docs/validation.md), [cobertura](docs/coverage.md) e [limitações](docs/known-issues.md).
- [Requisitos originais](docs/project-brief.md).

A pipeline [Testes e build](.github/workflows/ci.yml) verifica o código no GitHub e produz artefatos de CI; **artefatos de Actions não são substitutos de uma release pública instalável**.
