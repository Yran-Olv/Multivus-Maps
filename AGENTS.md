# Regras do Projeto Multivus Maps

## Regra de Ouro de Deploy e Versionamento (Git)
- **Sempre que realizar deploy ou enviar atualizações para os ambientes (produção, staging ou VPS):**
  1. Realize `git status` para auditar os arquivos modificados.
  2. Faça `git add` dos arquivos de código, migrações, documentação e seeds pertinentes.
  3. Crie um `git commit` com mensagem semântica e clara em português descrevendo as alterações.
  4. Realize `git push` para o repositório remoto (`origin main`).
  5. Nunca deixe arquivos de funcionalidade entregue pendentes no repositório local sem commit e push.
