# Dados do Mapa e Fontes Cartográficas — Multivus Maps

O Multivus Maps adota uma política rigorosa de **integridade cartográfica**:
- **NÃO inventar coordenadas.**
- **NÃO desenhar linhas artificialmente sem fonte cartográfica real ou conferência em campo.**
- **NÃO usar a posição visual de plantas esquemáticas ou PDFs para estimar latitude/longitude.**

---

## 1. Separação de Proveniência (Data Provenance)

O sistema diferencia formalmente a origem de cada dimensão de um logradouro:

| Dimensão | Fonte Padrão Inicial | Fonte de Geometria | Conferência Local |
|---|---|---|---|
| **Nome Oficial & Aliases** | Prefeitura Santa Juliana (07/2021) | — | Revisão Administrativa |
| **Geometria da Via (Traçado)** | — | OpenStreetMap (OSM 2026) | Editor Cartográfico (`/admin/mapa`) |
| **Bairro** | Indicação textual inicial | Polígonos de Bairros | Confirmação Local (`CONFIRMED`) |
| **Sentido de Circulação** | Indeterminado / Ambos (`BOTH`) | Tags OSM (`oneway`) | Conferência Local de Trânsito |
| **Conversões Permitidas/Proibidas** | — | — | Registro em Campo (`turn_restrictions`) |
| **Numeração Predial** | Futuro CNEFE/IBGE | Pontos GPS de Entrega | `address_points` verificados |

Cada registro armazena:
- `source` (fonte documental do nome)
- `source_date` (data da fonte documental)
- `geometry_source` (fonte do traçado cartográfico)
- `geometry_source_date` (data da extração cartográfica)
- `geometry_verified` (se a linha foi inspecionada e aprovada)
- `neighborhood_status` (`PENDING` ou `CONFIRMED`)
- `confidence_score` (0 a 100)
- `verified_by` e `verified_at`

---

## 2. O que o PDF da Prefeitura (07/2021) é e não é

### O que é
`MAPA SantaJuliana.pdf` é uma planta esquemática do perímetro urbano produzida em julho de 2021 pela Prefeitura Municipal. Serve exclusivamente como **fonte cadastral de nomes e histórico de renomeações urbanas**.

O mapa registra dezenas de alterações de nomenclatura floral para homenagens municipais:
- *Rua Lírios* → **Rua Orivaldo José Pires**
- *Rua Girassóis* → **Rua Elmar Goulart de Andrade**
- *Rua Violetas* → **Rua Antonio Gonçalves da Cunha**
- *Rua Orquídeas* → **Rua Euripedes Patrocinio de Morais**
- *Rua Pau Brasil* → **Rua Nigrim Carneiro**
- e outras 150+ vias.

### O que não é
O PDF **não é georreferenciado**. Não possui sistema de coordenadas EPSG projetado ou geodésico confiável. Por isso:
- Nenhuma via recebe geometria automática do PDF.
- Bairros não são associados pela proximidade visual aproximada na folha.
- Confiança inicial dos nomes do PDF: **70/100** (fonte oficial documental, sem verificação presencial contemporânea).

---

## 3. OpenStreetMap (OSM) como Base Cartográfica Real

A geometria das vias é importada a partir de extrações reais do OpenStreetMap através do pacote `@multivus/map-import`.

1. **Extração:** Formatos `.osm`, `.osm.pbf`, `.geojson` ou `.gpkg`.
2. **Normalização & Matching:** Algoritmo ponderado de 6 critérios (`MATCH_EXACT`, `MATCH_ALIAS`, `MATCH_FUZZY`, `CONFLICT`, `NEW_STREET`, `UNRESOLVED`).
3. **Staging:** Armazenamento em `osm_import_records`.
4. **Inspeção Humana:** Painel de Conferência Cartográfica em `/admin/mapa`.
5. **Aprovação:** Apenas vias aprovadas por editor recebem `geometry_verified = true` e `confidence_score = 100`.

---

## 4. Integração Futura: CNEFE / IBGE

Para localização exata de portas e números prediais:
- A tabela `address_points` (`id`, `street_id`, `number`, `geometry`, `source`, `verified`, `confidence_score`) está estruturada para receber as coordenadas das faces de quadra do CNEFE (Cadastro Nacional de Endereços para Fins Estatísticos) do Censo IBGE.
- Permite que o entregador que busca `"Rua Orivaldo José Pires, 120"` trace a rota até a frente do lote, e não apenas ao centroide da rua.

---

## 5. Conferência Local de Trânsito

Sentidos de circulação (`street_segments`) e restrições de manobra (`turn_restrictions` como `NO_LEFT`, `NO_U_TURN`):
- **Não** são herdados cegamente de bases externas.
- Devem ser inspecionados ou confirmados no trânsito local por entregadores e editores credenciados.
