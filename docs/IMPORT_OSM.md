# Guia de Importação de Dados OpenStreetMap (OSM) — Multivus Maps

O Multivus Maps utiliza o OpenStreetMap (OSM) como **base cartográfica real** para traçados de vias, nós viários e nós de intersecção urbana em Santa Juliana (MG).

---

## 1. Princípios Fundamentais

1. **Sem download automático durante build:** Os builds e testes unitários nunca dependem de requisições de rede externas.
2. **Entrada por arquivo local:** A ferramenta aceita arquivos locais nos formatos:
   - OpenStreetMap XML (`.osm`)
   - Protocolbuffer Binary Format (`.osm.pbf` ou `.pbf`)
   - GeoJSON FeatureCollection (`.geojson` ou `.json`)
   - OGC GeoPackage (`.gpkg`)
3. **Sem sobrescrita cega:** A importação nunca altera diretamente o cadastro oficial sem gerar relatórios de matching e passar por conferência.

---

## 2. Fluxo da Importação

```text
Arquivo OSM Local (.osm / .osm.pbf)
           ↓
packages/map-import (Parser & Normalização)
           ↓
Algoritmo de Matching Ponderado (6 critérios)
           ↓
Geração de Relatório JSON (data/import/reports/<lote>.json)
           ↓
Persistência em Tabela de Staging (osm_import_records)
           ↓
Conferência Cartográfica Visual (/admin/mapa)
           ↓
Aprovação pelo Editor → Geometria Atualizada na Via (verified = true, confidence = 100)
```

---

## 3. Comandos CLI

### Passo 1: Importar arquivo e gerar relatório
Coloque o arquivo da extração em `data/import/osm/` (exemplo: `data/import/osm/santa-juliana.osm`).

Execute:
```bash
pnpm map:import osm ./data/import/osm/santa-juliana.osm
```

O comando:
- Processa as geometrias das vias públicas (excluindo caminhos de pedestres e ciclovias).
- Executa o matching com as 154 ruas cadastradas no Multivus Maps.
- Salva o relatório detalhado em `data/import/reports/santa-juliana.json`.
- Grava os registros no banco na tabela `osm_import_records`.

### Passo 2: Pré-visualizar o resumo do lote
```bash
pnpm map:preview santa-juliana
```

Exibe o balanço do lote:
- `MATCH_EXACT`: Vias cujo nome atual coincide exatamente (após normalização).
- `MATCH_ALIAS`: Vias que coincidem com um nome antigo ou popular registrado.
- `MATCH_FUZZY`: Vias com pequenas variações de grafia ou digitação (similaridade trigram/Levenshtein).
- `CONFLICT`: Ambiguidade entre múltiplas vias candidatas.
- `NEW_STREET`: Vias presentes no OSM que ainda não constam no cadastro municipal.
- `UNRESOLVED`: Vias municipais sem correspondência encontrada na extração.

### Passo 3: Aplicar automaticamente correspondências exatas (Opcional)
Se desejar aplicar de imediato as correspondências com 100% de certeza:
```bash
pnpm map:apply santa-juliana --exact-only
```
Todas as correspondências `MATCH_EXACT` receberão geometria no Multivus Maps com `confidence_score = 100`, gerando auditoria em `audit_logs` (`STREET_GEOMETRY_APPROVED`).

Para aplicar tudo do lote (incluindo aliases de alta confiança):
```bash
pnpm map:apply santa-juliana
```

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
