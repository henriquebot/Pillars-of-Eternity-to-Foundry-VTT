# Resultados e limites da validação (05/11/2026)

## Suíte independente do código 0.1.6 / release v0.1.8

No PowerShell Windows, após sincronizar código, testes e ferramentas da mesma versão, `python tools/verify.py` terminou com **exit code 0**:

| Suíte | Executados | Aprovados | Falhas |
|---|---:|---:|---:|
| Python | 82 | 82 | 0 |
| Node.js | 104 | 104 | 0 |
| **Total** | **186** | **186** | **0** |

O build `python tools/build_release.py` também passou: `rpgup-pillars-importer-0.1.6.zip` com **14 arquivos permitidos** e `commercialResourcesIncluded: false`. A release v0.1.8 usa a mesma base funcional e corrige metadados do manifesto. O GitHub Actions executou testes e publicou `module.json` e `module.zip` com sucesso para v0.1.8.

Essas suítes usam dados próprios/fixtures e dublês de API quando necessário; **não substituem ensaios reais como GM/Player**. O hash e as evidências de compilações locais estão em `local/validation/`, não no repositório público.

## Evidência de Foundry real

- Foundry Desktop **14.370**, sistema dnd5e **6.0.6**, mundo isolado `rpgup-pillars-tests`.
- CDP/PowerShell `Invoke-FoundryCdp.ps1 -Probe` foi executado com sucesso tanto pelo usuário quanto pelo Codex, confirmando GM ativo; a primeira validação confirmou importer **0.1.5** carregado. A **instalação e inicialização da release 0.1.8 ainda devem ser verificadas por novo probe**, e não inferidas da publicação.
- Seis cenas do prólogo importadas na nova pasta. O GM conferiu o aspecto dos fundos; Valewood e Gilded Vale tiveram mosaicos corrigidos. Isto **não atesta combate, paredes, navegação, luz ou visibilidade**.
- Piloto de três pins no **novo Encampment**, com Glimpse **1.3.0**: **3 Notes + 3 Journals**; `locations.export()` confirmou os três, e reimportação marcou **3/3 unchanged**, sem duplicatas. O adaptador da base 0.1.6 foi executado via CDP enquanto o runtime ainda informava 0.1.5.
- As outras cinco cenas e a Encampment antiga não tiveram seus dados alterados pelo piloto.
- Ainda **sem** conferência visual dos cards, teste por usuário Player, mídia específica/sons confirmados, teste de volume e validação completa da preservação de edições manuais no mundo real.

## Próxima verificação

Seguir o [estado atual](current-status.md) e [validação](validation.md). Capturar versões e evidências por ação real; atualizar esta página somente com resultados observados. Não converter testes de mocks em homologação da plataforma.
