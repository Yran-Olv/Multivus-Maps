# Resolvedor de Endereços Locais (Nomes Antigos vs. Atuais) — Multivus Maps

O Multivus Maps não é apenas um mapa com busca textual: ele é um **resolvedor de endereços locais** projetado para resolver a dor cotidiana dos entregadores de Santa Juliana (MG).

---

## 1. O Problema Central

Muitos moradores e comerciantes de Santa Juliana ainda conhecem e fornecem seus endereços utilizando **nomes antigos de ruas** (muitos baseados em nomes de flores ou árvores), enquanto a legislação municipal alterou os nomes oficiais para homenagear cidadãos e personalidades da cidade.

### Cenário Real
- O cliente envia no WhatsApp: `"Rua Lírios, 120, casa azul perto da igreja"`
- O nome oficial da via é: **Rua Orivaldo José Pires**
- Se o entregador buscar no Google Maps tradicional por "Rua Lírios", pode não encontrar nada ou ser direcionado para outra cidade.
- No **Multivus Maps**, o sistema reconhece que "Rua Lírios" é a **Rua Orivaldo José Pires**, preserva o número `120`, isola a referência `"casa azul perto da igreja"`, avisa o entregador sobre a mudança e traça a rota para o ponto correto.

---

## 2. Regra Fundamental: Identidade Geográfica Única

**Nomes antigos NUNCA criam outra rua.**

```text
TABELA: streets
id: "9c3c1e2a-..."
official_name: "Rua Orivaldo José Pires"
geometry: LineString(...)

TABELA: street_aliases
street_id: "9c3c1e2a-..."
alias: "Rua Lírios"
alias_type: "OLD_NAME"
active: true

street_id: "9c3c1e2a-..."
alias: "Lírios"
alias_type: "OLD_NAME"
active: true
```

Tanto quem pesquisa `"Lírios"`, `"Rua Lírios"` quanto quem pesquisa `"Rua Orivaldo José Pires"` acessa a **mesma entidade geográfica**.

---

## 3. Normalização e Tolerância a Erros

O pipeline de normalização (`packages/map-core/src/normalize.ts`) remove ruídos que não alteram a identidade da via:
- Remoção de acentos (`Lírios` → `lirios`, `José` → `jose`)
- Conversão para minúsculas
- Remoção de pontuações (`R.` → `r`, `-` → ` `)
- Normalização de prefixos de logradouro (`Rua`, `Av.`, `Avenida`, `Travessa`, `Alameda`)
- Colapso de múltiplos espaços em branco

### Busca Tolerante (`pg_trgm` e Levenshtein)
Erros de digitação comuns no teclado de celular são tolerados:
- `"Liros"` → resolve para **Rua Orivaldo José Pires (antiga Lírios)**
- `"Orivaldo Jose"` → resolve para **Rua Orivaldo José Pires**
- `"Jose Pires"` → resolve para **Rua Orivaldo José Pires**

---

## 4. Função "Entender Endereço"

A função inteligente de parsing (`parseAddressText` em `packages/map-core/src/parse.ts`) recebe mensagens brutas coladas diretamente do WhatsApp de clientes ou de comandas de restaurantes:

### Exemplo de Entrada:
```text
Entrega na Rua Lírios 120, casa azul perto da igreja
```

### Processamento:
1. **Logradouro extraído:** `Rua Lírios` → resolvido para `Rua Orivaldo José Pires`
2. **Nome cliente detectado:** `Rua Lírios` (Nome antigo identificado)
3. **Número predial extraído:** `120`
4. **Referência isolada:** `casa azul perto da igreja`
5. **Aviso didático:** `⚠️ Cliente utilizou o nome antigo: Rua Lírios. O nome atual é Rua Orivaldo José Pires.`

---

## 5. Escala de Confiança Cartográfica (Confidence Score)

Cada resolução apresenta um score de confiabilidade claro para o entregador:

| Score | Significado | Exemplo no Multivus |
|---|---|---|
| **100** | Fonte oficial + Conferência local verificada | Traçado OSM revisado em `/admin/mapa` |
| **95** | Fonte oficial + outra fonte independente confirmando | Decreto municipal + OSM concordantes |
| **90** | Duas fontes confiáveis concordantes | Cadastro comercial local + OSM |
| **70** | Mapa oficial antigo sem conferência local | Cadastro esquemático da Prefeitura (07/2021) |
| **60** | Fonte confiável parcial | Indicação de placas de trânsito não atualizadas |
| **50** | Inferência textual aproximada | Busca difusa / digitação provável |
| **0** | Não confirmado | Informação sem evidência verificada |

> [!NOTE]
> O Multivus Maps nunca apresenta dados com confiança 70 como "confirmados" ou "verificados". Apenas dados com 100/100 recebem a badge de verificação.

---

## 6. Preservação dos Dados da Entrega

Ao registrar ou salvar uma entrega, o sistema mantém fidelidade ao que foi digitado:
- `customer_input`: `"Rua Lírios 120"`
- `matched_alias`: `"Rua Lírios"`
- `official_street`: `"Rua Orivaldo José Pires"`
- `street_number`: `"120"`
- `reference`: `"casa azul perto da igreja"`

Ao compartilhar o endereço com outros entregadores, o texto privilegia a clareza operacional:
```text
📍 Rua Orivaldo José Pires, 120
(Antiga Rua Lírios)
Santa Juliana - MG
```
