# Validação e evidências

`python tools/verify.py` executa testes Python e Node. Esses testes usam pequenas fixtures próprias e dublês da API Foundry quando necessário; não carregam o servidor Foundry, o sistema D&D ou módulos de terceiros. O número e resultado da última execução estão em `docs/test-results.md`.

Checklist pendente em ambiente real, por mundo descartável:

1. Instalar em 14.369/dnd5e6.0.x sem módulos opcionais; abrir painel GM e verificar que jogador não tem acesso.
2. Extrair uma instalação legítima e revisar nomes, traduções, ligações de conversa e quests contra o jogo.
3. Importar o piloto Encampment, Cilant Lîs e Gilded Vale quando houver assets/posições reais; não usar fixtures como evidência de campanha.
4. Entrar com usuário jogador separado; inspecionar journals e documentos recebidos, impedindo leitura de spoilers, flags e textos GM.
5. Conferir dimensões e marcadores em pontos de controle, registrar erro em pixels. Calibrar manualmente quando necessário.
6. Testar posicionamento e movimento de tokens, distância, alcance de ataques, paredes, portas, visão e iluminação. Só depois marcar uma cena pronta para combate.
7. Saquear um contêiner real, transferir itens, reimportar, confirmar que o saque não reaparece; itens e automações ainda dependem das funcionalidades implementadas.
8. Avançar uma quest, editar um journal, reimportar e verificar preservação. Induzir falha em mundo descartável e validar recuperação pelo backup.
9. Repetir em segundo mundo e verificar estados separados. Não reutilizar dados de progresso como conteúdo compartilhado.
10. Habilitar cada opcional isoladamente, com versões registradas; confirmar compatibilidade por comportamento observado. Nenhum deles foi validado neste projeto.

Capturar versões, IDs e resultados por teste, com falhas explícitas. Capturas e recibos locais podem ficar em `local/validation/`, ignorado pelo Git. O relatório de cobertura conta somente entidades processadas; sem importação real todos os valores de importação/validação continuam zero.
