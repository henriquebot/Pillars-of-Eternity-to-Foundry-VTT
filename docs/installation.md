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

O arquivo `dist/rpgup-pillars-importer-0.1.0.zip` é um pacote local de desenvolvimento. Com o Foundry parado, extraia seu conteúdo em `<UserData>/Data/modules/rpgup-pillars-importer/`, de modo que `module.json` fique diretamente nessa pasta. Em Docker, identifique primeiro o volume que corresponde ao UserData; caminhos variam entre imagens. O projeto não assume nem modifica seu Docker automaticamente.

Reinicie o Foundry e habilite o módulo em um **mundo descartável** com Foundry V14 e sistema D&D 5e 6.0.x. O alvo inicial é 14.369; não houve execução real nesta versão. Não há URL de instalação pela internet: nenhum repositório ou release foi publicado. O ZIP não contém dados da campanha nem arte do jogo.

Importe o JSON pelo painel descrito em `docs/foundry.md`, revise a seleção e os avisos. Para cenas, disponibilize primeiro uma imagem local autorizada em UserData e forneça seus dados/dimensões no IR. Os parsers atuais não extraem fundos dos bundles Unity. Sem imagem confiável, o mapa permanece pendente.

Nunca instale esta versão diretamente no mundo de produção. A validação real segue `docs/validation.md`; não foi executada automaticamente por estes comandos.
