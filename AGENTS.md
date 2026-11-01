# Trabalho neste projeto

Leia README.md e docs/known-issues.md antes de continuar. O escopo completo autorizado está em docs/project-brief.md. Não trate a primeira release como campanha concluída.

- Não escrever na instalação original nem no staging do Steam. Recursos comerciais e IR reais ficam em local/ (ignorado) ou fora do repositório; nunca no release.
- Não executar scripts recuperados, inventar dados de campanha ou afirmar validação Foundry a partir de testes com mocks.
- Não modificar mundos existentes. Testes reais exigem mundo descartável; publicação/deploy em produção depende de autorização explícita.
- Preservar IDs, proveniência, progresso de mundo e edições do mestre. Backup antes de writes, sem exclusão automática.
- Pesquisar APIs atuais em fontes primárias. V14 usa Level para backgrounds. Manter opcionais realmente opcionais e respeitar conflitos declarados.
- Rodar `python tools/verify.py` e `python tools/build_release.py` após alterações relevantes; atualizar os resultados e a lista de pendências com evidências reais.
- O scanner é limitado a metadados de instalação/raízes explícitas, sem varredura recursiva do disco inteiro.

Anotações privadas da instalação e autorizações específicas ficam em `local/validation/`, ignorado pelo Git; consulte-as quando disponíveis. A autorização recebida na conversa persiste: não pedir novamente ações já autorizadas. Nunca publicar endereços privados, registros de acesso ou inventários de servidor como parte da documentação pública. Autenticação e definição de senha ficam com o usuário.
