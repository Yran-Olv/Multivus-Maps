# Guia de Importação de Dados OpenStreetMap (OSM) — Multivus Maps

O Multivus Maps utiliza o OpenStreetMap (OSM) como **base cartográfica real** para traçados de vias, nós viários e nós de intersecção urbana em Santa Juliana (MG).

---

## 1. Princípios Fundamentais

1. **Sem download automático durante build:** Os builds e testes unitários nunca dependem de requisições de rede externas.
2. **Entrada por arquivo local:** A ferramenta processa OpenStreetMap XML (`.osm`) e GeoJSON FeatureCollection (`.geojson` ou `.json`). Converta PBF e GeoPackage para um desses formatos antes de importar.
3. **Sem sobrescrita cega:** A importação nunca altera diretamente o cadastro oficial sem gerar relatórios de matching e passar por conferência.
4. **Simulação por padrão:** `map:import` não grava no banco, a menos que `--persist-staging` seja informado.
5. **Área municipal:** Toda gravação no staging exige um limite municipal GeoJSON válido; as geometrias são recortadas com PostGIS.
6. **Atribuição:** Dados OSM são disponibilizados sob ODbL. Preserve a atribuição ao OpenStreetMap e consulte as obrigações aplicáveis à redistribuição.

---

## 2. Fluxo da Importação

```text
Arquivo OSM Local (.osm / .geojson)
           ↓
packages/map-import (Parser & Normalização)
           ↓
Algoritmo de Matching Ponderado (6 critérios)
           ↓
Recorte opcional por limite municipal (PostGIS)
           ↓
Relatório JSON (data/import/reports/<lote>.json)
           ↓
Persistência explícita e idempotente no staging (osm_import_records)
           ↓
Conferência Cartográfica Visual (/admin/mapa)
```

---

## 3. Comandos CLI

### Passo 1: Simular e gerar relatório
Coloque o arquivo da extração em `data/import/osm/` (exemplo: `data/import/osm/santa-juliana.osm`).

Execute:
```bash
pnpm map:import osm ./data/import/osm/santa-juliana.osm \
  --boundary ./data/import/boundaries/santa-juliana.geojson \
  --report-dir /tmp/multivus-map-import
```

O comando:
- Processa vias e mantém separados trechos de mesmo nome que não compartilham endpoints.
- Valida as coordenadas WGS84 e recorta as vias pelo polígono municipal com PostGIS.
- Executa o matching contra as ruas atuais do banco; o seed local só é usado em modo offline sem `DATABASE_URL`.
- Salva o relatório no diretório indicado, sem gravar no banco.

O limite municipal precisa vir de uma fonte confiável (por exemplo, malha municipal oficial do IBGE). O importador não baixa nem inventa esse polígono.

### Passo 2: Persistir candidatos para revisão (opcional)
Após conferir o relatório e garantir que as migrations foram aplicadas:
```bash
pnpm db:migrate
pnpm map:import osm ./data/import/osm/santa-juliana.osm \
  --boundary ./data/import/boundaries/santa-juliana.geojson \
  --persist-staging
```

A opção `--persist-staging` atualiza candidatos pela chave `(lote, ID OSM)`, sem apagar registros antigos. Estados de revisão são mantidos somente quando geometria, tags, nome e associação à rua continuam iguais; alterações reiniciam o item como pendente. Repetir a mesma importação não cria novas linhas.

### Passo 3: Pré-visualizar o resumo do lote
```bash
pnpm map:preview santa-juliana --report-dir /tmp/multivus-map-import
```

Exibe o balanço do lote:
- `MATCH_EXACT`: Vias cujo nome atual coincide exatamente (após normalização).
- `MATCH_ALIAS`: Vias que coincidem com um nome antigo ou popular registrado.
- `MATCH_FUZZY`: Vias com pequenas variações de grafia ou digitação (similaridade trigram/Levenshtein).
- `CONFLICT`: Ambiguidade entre múltiplas vias candidatas.
- `NEW_STREET`: Vias presentes no OSM que ainda não constam no cadastro municipal.
- `UNRESOLVED`: Vias sem correspondência determinada.

### Passo 4: Aprovar geometrias
O matching exato não comprova o nome legal, a correspondência geográfica nem a entrada de um imóvel. Revise e aprove os candidatos em `/admin/mapa`. A aprovação registra a proveniência e a confirmação da geometria; ela não transforma o centro da rua em coordenada residencial nem eleva automaticamente a confiança do nome.

O comando de sincronização aplica somente itens que já estejam com status `APPROVED` no staging. A opção `--exact-only` restringe ainda mais a operação:
```bash
pnpm map:apply santa-juliana --exact-only
```
Use-o somente após backup. Sem aprovação humana prévia no painel, nenhum item será sincronizado; aliases, fuzzy e novos logradouros sempre exigem decisão humana.

---

## 4. Conferência Visual em `/admin/mapa`

Acesse `http://localhost:5173/admin/mapa`:
1. Ative as camadas **MULTIVUS** (amarelo/verde) e **OSM** (roxo/azul).
2. Na aba **Conferência OSM**, filtre por tipo (`MATCH_EXACT`, `MATCH_ALIAS`, `MATCH_FUZZY`, `CONFLICT`, `NEW_STREET`).
3. Clique em uma via para inspecionar sobreposição de traçados e detalhes.
4. Utilize os botões de ação:
   - **APROVAR GEOMETRIA:** Valida o traçado OSM para a via selecionada.
   - **REJEITAR:** Descarta o registro de importação.
   - **MESCLAR:** Associa a geometria OSM a qualquer outra rua cadastrada.
   - **CRIAR NOVA VIA:** Cadastra uma rua nova que só existia no OSM.
   - **MARCAR COMO CONFLITO:** Sinaliza para inspeção presencial por entregadores.
   - **CONFIRMAR BAIRRO:** Confirma o bairro oficial da via com rastreabilidade.
