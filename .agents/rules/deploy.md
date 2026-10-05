# Regra de Deploy e Controle de Versão

Sempre que enviar alterações para deploy ou atualizar o servidor de produção/VPS:
1. Auditar arquivos alterados.
2. Realizar `git add` de todos os arquivos relevantes (código, migrations, seeds, docs, configs).
3. Criar commit descritivo em português.
4. Executar `git push` para o branch remoto configurado.
5. Manter o repositório no GitHub sempre 100% alinhado com o que está em produção.
