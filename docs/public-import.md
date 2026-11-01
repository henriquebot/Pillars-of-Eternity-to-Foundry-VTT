# Referências públicas: importação offline

O utilitário `tools/import-public.mjs` converte JSON **do formato próprio abaixo** para IR. Não é um scraper Itemaps/Fandom e não adivinha nomes de campos dos sites. A aquisição específica dessas fontes permanece pendente, conforme [source-audit.md](source-audit.md).

O arquivo de entrada precisa ter sido obtido/preparado legitimamente. `source.rights` registra a base declarada pelo usuário; não concede direitos novos. Opções aceitas: `user-authorized`, `personal-reference` e `licensed`. A saída sempre registra `redistribution:false`, fonte HTTPS e atribuição. Não colocar dados comerciais de entrada/saída no repositório ou release.

Exemplo **sintético e autoral**, sem conteúdo comercial:

```json
{
  "format": "rpgup-public-source/v1",
  "source": {
    "url": "https://example.org/meu-mapa-de-teste",
    "attribution": "Fixture própria RPG UP",
    "rights": "user-authorized",
    "language": "pt-BR"
  },
  "maps": [{
    "id": "praca-teste",
    "name": "Praça sintética",
    "width": 1000,
    "height": 500,
    "pins": [{
      "id": "placa-teste",
      "name": "Placa sintética",
      "category": "examinable",
      "x": 125.5,
      "y": 200.25,
      "description": "Texto criado exclusivamente para testar o importador.",
      "conditions": [],
      "questRefs": [],
      "relatedPins": []
    }]
  }]
}
```

Execução a partir da raiz do projeto:

```powershell
node tools/import-public.mjs CAMINHO-ENTRADA.json CAMINHO-SAIDA.json
```

A saída existente não é sobrescrita; nenhuma rede é acessada. É permitido chamar `normalizePublicSource` por import ESM e fixar `extractedAt` para reprodução de testes.

O sistema de coordenadas de entrada é pixel, origem superior esquerda, x para direita e y para baixo. Dimensões são obrigatórias; posições fora dos limites e números inválidos são recusados. Se uma fonte usar outra convenção, sua aquisição precisa normalizar antes. A saída preserva `data.sourcePosition` e `data.position`; não inventa escala de combate.

As categorias aceitas são `npc`, `enemy`, `neutral-creature`, `container`, `treasure`, `examinable`, `document`, `book`, `door`, `passage`, `trap`, `resource`, `poi`, `quest-objective`, `transition`, `other`. Há aliases mínimos das categorias observadas no índice público: Character→npc, Loot→treasure, Loot Plant→resource, Point Of Interest→poi, Exit→transition. “Loot” não é convertido automaticamente em contêiner. Desconhecidos ficam `other` com categoria original e diagnóstico. Condições são textos inertes, sem execução ou automação.

Maps saem com asset e calibração pendentes, `combatValidated:false` e nenhum fundo copiado. Pins saem com `visibility:'gm'` e sem criar documentos Foundry. Uma saída não recebe destino inferido. Nomes permanecem no idioma declarado (`en` ou `pt-BR`), sem tradução fabricada. Os IDs dependem da URL e identificadores originais, e não de nome, descrição ou data; corrigir um texto não cria outra entidade. Referências de quests/pinos são preservadas ainda não resolvidas.

HTML é recusado como arquivo de entrada. Texto que contenha marcação dentro do JSON é preservado como **texto inerte**, não sanitizado para renderização HTML: a interface consumidora deve escapar o texto, e não atribuí-lo a `innerHTML`. Isso conserva fidelidade e evita confiar numa sanitização por expressão regular. Limites: JSON de 16 MiB, 10000 mapas e 100000 pinos no lote, profundidade 32 e rejeição de chaves de prototype pollution.

Os testes `tests/js/public-import.test.mjs` usam somente conteúdo próprio e verificam coordenadas, IDs, proveniência, categorias, duplicatas, idiomas e rejeição de entradas inseguras. Passar esses testes não significa que uma página real de site tenha sido processada.
