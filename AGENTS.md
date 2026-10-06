# Regras do Projeto Multivus Maps

## Regra de Ouro de Deploy e Versionamento (Git)
- **Sempre que realizar deploy ou enviar atualizações para os ambientes (produção, staging ou VPS):**
  1. Realize `git status` para auditar os arquivos modificados.
  2. Faça `git add` dos arquivos de código, migrações, documentação e seeds pertinentes.
  3. Crie um `git commit` com mensagem semântica e clara em português descrevendo as alterações.
  4. Realize `git push` para o repositório remoto (`origin main`).
  5. Nunca deixe arquivos de funcionalidade entregue pendentes no repositório local sem commit e push.

## Regra de Velocidade, Foco e Eficiência
- **Para alterações simples e pontuais (ajustes visuais, textos, pequenos bugs, estilos):**
  - Vá direto ao arquivo do componente e aplique a alteração imediatamente.
  - NÃO crie planos longos, não invoque subagentes e não rode builds/testes pesados desnecessários para edições simples de poucas linhas.
- **Para tarefas complexas (novas features, deploys, migrações):**
  - Siga a validação completa, testes e o fluxo de deploy com commit e push.
