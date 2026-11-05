# Instalação e execução local

Requisitos de desenvolvimento: Python 3.11+ e Node 22+. Não é necessário `npm install` para executar os testes. Todos os comandos abaixo partem da raiz deste projeto. Em Windows, use PowerShell.

```powershell
$env:PYTHONPATH = (Join-Path $PWD 'extractor')
python -m rpgup_pillars scan --output local/scan.json
python -m rpgup_pillars scan --root 'D:\Jogos\Pillars of Eternity' --output local/scan.json
python -m rpgup_pillars extract --root 'D:\Jogos\Pillars of Eternity' --language pt-BR --output local/campaign.json
python -m rpgup_pillars validate local/campaign.json
python -m rpgup_pillars package local/campaign.json --output local/pilot.json --select-source 'conversations/00*'
python -m rpgup_pillars catalog-images --root 'D:\RecursosExtraidos' --output local/images.json
python tools/verify.py
python tools/build_release.py
```

Linux:

```sh
export PYTHONPATH="$PWD/extractor"
python3 -m rpgup_pillars scan --output local/scan.json
python3 -m rpgup_pillars extract --root '/games/Pillars of Eternity' --language pt-BR --output local/campaign.json
python3 -m rpgup_pillars package local/campaign.json --output local/pilot.json --select-source 'conversations/00*'
python3 tools/verify.py
python3 tools/build_release.py
```

O extrator nunca deve escrever na pasta do jogo. O diretório de saída deve ficar em outro local. Campos sem tradução PT-BR mantêm idioma e indicação de fallback. A extração de textos não produz automaticamente mapas, Actors, itens utilizáveis ou combate adaptado.

O arquivo `dist/rpgup-pillars-importer-<versão>.zip` é um pacote local de desenvolvimento; seu nome depende do campo `version` em `foundry/module.json`. Com o Foundry parado, extraia seu conteúdo em `<UserData>/Data/modules/rpgup-pillars-importer/`, de modo que `module.json` fique diretamente nessa pasta. Em Docker, identifique primeiro o volume que corresponde ao UserData; caminhos variam entre imagens. O projeto não assume nem modifica seu Docker automaticamente.

Reinicie o Foundry e habilite o módulo em um **mundo descartável** com Foundry v14 (ambiente de desenvolvimento mais recente usado no projeto: **14.370**) e sistema D&D 5e 6.0.x. O código público ainda corresponde ao módulo 0.1.0, que não deve herdar alegações de validação feitas localmente para 0.1.6. O repositório existe no GitHub, mas **não há release publicada**: a URL prevista `https://github.com/henriquebot/Pillars-of-Eternity-to-Foundry-VTT/releases/latest/download/module.json` só funcionará após publicar `module.json` e `module.zip` pela workflow de release. O ZIP não contém dados da campanha nem arte do jogo.

Importe o JSON pelo painel descrito em `docs/foundry.md`, revise a seleção e os avisos. Para cenas, disponibilize primeiro uma imagem local autorizada em UserData e forneça seus dados/dimensões no IR. Os parsers atuais não extraem fundos dos bundles Unity. Sem imagem confiável, o mapa permanece pendente.

Nunca instale esta versão diretamente no mundo de produção. A validação real segue `docs/validation.md`; não foi executada automaticamente por estes comandos.
