# RPG UP — Pillars of Eternity → Foundry VTT

Ferramentas de extração e importação local de **Pillars of Eternity 1 / The White March** para **Foundry VTT v14 (referência de desenvolvimento: 14.370)**, com **D&D 5e 6.0.x / regras 2024**. Interface PT-BR.

> **Estado:** o módulo foi sincronizado com o código local 0.1.6 e testado em Foundry 14.370 (mundo de testes), com um piloto de três pins Glimpse. A release **0.1.8** declara compatibilidade verificada com Foundry **14.370** (o piloto e os testes descritos não equivalem à validação de uma campanha completa). **Ainda não é uma campanha completa pronta para combate**: falta validar a apresentação dos cards, o acesso como jogador e o processamento em volume.

O projeto pesquisa a conversão de mapas pré-renderizados, textos, quests, NPCs, itens e pontos de interesse para cenas, journals e outros recursos do Foundry. O foco é um pipeline reutilizável, com dados intermediários versionados, origem rastreável e reimportação controlada. A conversão não equivale a uma campanha completa e pronta para combate.

**O repositório não distribui mapas, imagens, áudio, textos comerciais, traduções protegidas nem dados da instalação de Pillars.** Recursos extraídos de uma cópia legítima devem permanecer localmente, fora do Git.

## Manifesto e instalação

O manifesto-fonte está em [`foundry/module.json`](foundry/module.json). O instalador de módulos do Foundry requer **um manifesto remoto e um ZIP de módulo publicados juntos**. Os dois são publicados juntos nas [releases do projeto](https://github.com/henriquebot/Pillars-of-Eternity-to-Foundry-VTT/releases).

Para instalar pelo Foundry, use a **URL do manifesto da release mais recente**:

```text
https://github.com/henriquebot/Pillars-of-Eternity-to-Foundry-VTT/releases/latest/download/module.json
```

**Publicação atual: v0.1.8**, com `module.json` e `module.zip`. Cole a URL acima em **Instalar módulo → URL do manifesto** no Foundry v14. A 0.1.8 adiciona `compatibility.verified: 14.370` sobre a base funcional 0.1.6, sem alterar as funcionalidades. Para substituir instalação local, faça backup do UserData e confira a versão do mundo de testes.

O workflow [Publicar módulo Foundry](.github/workflows/publish-module.yml) testa, empacota e publica `module.json` e `module.zip` quando a versão do manifesto muda. O ZIP inclui apenas código e interfaces do módulo, sem recursos comerciais. Para instalação de desenvolvimento, consulte [as instruções locais](docs/installation.md).

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
