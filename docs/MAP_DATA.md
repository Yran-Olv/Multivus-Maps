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

1. **Entrada:** OpenStreetMap XML (`.osm`) ou GeoJSON (`.geojson`/`.json`). PBF e GeoPackage precisam ser convertidos previamente.
2. **Normalização & Matching:** Algoritmo ponderado de 6 critérios (`MATCH_EXACT`, `MATCH_ALIAS`, `MATCH_FUZZY`, `CONFLICT`, `NEW_STREET`, `UNRESOLVED`).
3. **Simulação:** O comando gera um relatório e não grava no banco por padrão.
4. **Limite municipal:** Para persistir candidatos, é obrigatório fornecer um polígono municipal GeoJSON; o recorte e a validade são verificados pelo PostGIS.
5. **Staging:** `--persist-staging` atualiza `osm_import_records` idempotentemente e preserva decisões humanas quando a geometria e a associação não mudaram.
6. **Inspeção Humana:** Painel de Conferência Cartográfica em `/admin/mapa`.
7. **Aprovação:** A revisão cartográfica pode confirmar a geometria da via, não o nome, o número predial ou a entrada de um imóvel. Trechos aprovados são acumulados na geometria da rua, mantendo segmentos e fontes individuais; sentidos permanecem pendentes até verificação local. A confiança do nome não deve ser elevada apenas pela aprovação da geometria.

Consulte [`IMPORT_OSM.md`](./IMPORT_OSM.md) para comandos e opções. Dados derivados do OSM precisam manter a atribuição e cumprir a ODbL.

---

## 4. Integração Futura: CNEFE / IBGE

O arquivo municipal do CNEFE 2022 consultado no diretório oficial do IBGE contém 7.876 pontos. Na verificação espacial, 7.874 ficaram dentro da malha municipal utilizada. Uma análise exploratória do campo combinado `LOGRAD_NUM` encontrou 5.719 textos dos quais o parser extraiu número; 4.915 registros tiveram correspondência textual exata com nome ou alias ativo, e 4.270 combinaram correspondência textual e número extraído. Esses números são candidatos de análise, não endereços validados.

O CNEFE ainda não foi importado para `address_points`: 525 identificadores externos aparecem repetidos (527 linhas excedentes), o significado dos códigos `NV_GEO_COORD` não foi confirmado no dicionário, e as condições específicas de reutilização/atribuição precisam de confirmação antes da persistência. Portanto, **há zero pontos prediais no banco** e nenhum desses dados deve ser tratado como entrada residencial verificada.

Receita Federal: nenhum arquivo de estabelecimentos foi obtido ou processado nesta auditoria; endereço cadastral textual, por si só, não fornece coordenada precisa.

---

## 5. Conferência Local de Trânsito

Sentidos de circulação (`street_segments`) e restrições de manobra (`turn_restrictions` como `NO_LEFT`, `NO_U_TURN`):
- **Não** são herdados cegamente de bases externas.
- Devem ser inspecionados ou confirmados no trânsito local por entregadores e editores credenciados.
