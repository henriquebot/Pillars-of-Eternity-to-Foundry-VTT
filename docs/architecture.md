# Arquitetura e decisões

O extrator usa Python 3.11+ e biblioteca padrão. Isso permite scanner e XML somente leitura sem instalar uma ferramenta Unity de origem desconhecida. O módulo usa JavaScript ES modules e API pública Foundry V14. Node 22+ executa testes independentes. Não há serviço de rede, banco central nem credenciais no projeto.

Fluxo: instalação local → scanner/inventário → parsers estruturais → IR versionado → revisão e recursos locais → preview GM → documentos do mundo. Recursos protegidos ficam em `local/` ou fora deste repositório. O build aceita somente código/interface do módulo por allowlist; nunca copia a instalação nem o IR do usuário.

O conteúdo de origem, a adaptação D&D e o estado de campanha são camadas distintas. Scripts originais permanecem inertes. Não há uma regra genérica segura de converter fórmulas Pillars em atividades D&D 2024; faltando mapeamento verificado, o elemento fica pendente. O código não incorpora compêndios comerciais nem resolve uma criatura por semelhança do nome.

Cada mundo persiste seus próprios documentos/flags e estados. Não se usa uma variável global no servidor para progresso compartilhado. IDs estáveis permitem reimportar e detectar alterações; o motor de merge preserva os valores que o mestre alterou quando há conflito. Antes de alterações existentes, é exigido backup segundo a implementação Foundry; nenhum documento é removido automaticamente. Isso é verificado em testes independentes e ainda precisa de validação real em dois mundos.

Compêndios reutilizáveis, extração de Unity, geometria de navegação e automações de terceiros dependem de implementação/validação adicional conforme `docs/known-issues.md`. A ausência deles deve aparecer como limitação e nunca como importação bem sucedida.

O módulo recebe JSON local escolhido pelo GM. Não executa arquivos/scripts extraídos. Os parsers recusam DTD/entidades e impõem limites; o navegador apresenta texto externo escapado. Permissões e transporte de dados exigem teste com usuário jogador separado antes da campanha real.
