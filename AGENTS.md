# Regras do Projeto Multivus Maps

## Regra de Ouro de Deploy e Versionamento (Git & VPS)
- **Sempre que realizar deploy ou concluir atualizações solicitadas para produção:**
  1. Incremente a versão (`APP_VERSION`, `package.json`) e registre a data de build.
  2. Garanta que o botão de "Atualizar / Limpar Cache" mobile permaneça ativo e funcional.
  3. Realize `git status` para auditar os arquivos modificados.
  4. Faça `git add` dos arquivos de código, migrações, documentação e seeds pertinentes.
  5. Crie um `git commit` com mensagem semântica e clara em português descrevendo as alterações.
  6. Realize `git push` para o repositório remoto (`origin main`).
  7. **Execute o deploy completo na VPS (`77.37.41.172`):** sincronize o código para `/opt/multivus-maps` e reconstrua os containers de produção (`docker compose -f docker-compose.prod.yml up -d --build`).
  8. Valide os endpoints públicos ([https://maps.multivus.com.br/](https://maps.multivus.com.br/) e `/api/v1/health`).
  9. Nunca deixe arquivos de funcionalidade entregue pendentes no repositório local sem commit, push e deploy completo.

## Regra de Velocidade, Foco e Eficiência
- **Para alterações simples e pontuais (ajustes visuais, textos, pequenos bugs, estilos):**
  - Vá direto ao arquivo do componente e aplique a alteração imediatamente.
  - NÃO crie planos longos, não invoque subagentes e não rode builds/testes pesados desnecessários para edições simples de poucas linhas.
- **Para tarefas complexas (novas features, deploys, migrações):**
  - Siga a validação completa, testes e o fluxo de deploy com commit, push e build de produção na VPS.
