/**
 * Local Intelligence Layer - Classificador e Importador de CNPJs / Estabelecimentos
 * Filtra e ranqueia as empresas de Santa Juliana (MG) para apoiar entregadores
 * sem poluir o mapa com negócios que não servem como ponto de referência.
 */

export type EstablishmentCategory =
  | 'supermercado'
  | 'farmacia'
  | 'posto'
  | 'padaria'
  | 'materiais_construcao'
  | 'hospital'
  | 'rodoviaria'
  | 'orgao_publico'
  | 'banco'
  | 'escola'
  | 'igreja'
  | 'praca'
  | 'oficina'
  | 'comercio'
  | 'outro'

export type ClassifiedEstablishment = {
  cnpj?: string
  name: string
  normalizedName: string
  category: EstablishmentCategory
  importanceScore: number
  aliases: string[]
  address?: string
  streetName?: string
  streetNumber?: string
  neighborhood?: string
  latitude?: number
  longitude?: number
  source: 'cnpj' | 'osm' | 'receita_federal' | 'brasil_api' | 'manual' | 'municipal'
  isRelevantForCouriers: boolean
}

/**
 * Mapeamento de CNAEs e Palavras-Chave para a hierarquia de importância:
 * 100: Hospital, Rodoviária, Prefeitura, Câmara
 * 95: Supermercados de grande porte, Postos de Combustível, Delegacia
 * 90: Farmácias, Correios, Laboratórios
 * 85: Bancos, Escolas
 * 80: Igrejas Matrizes, Praças centrais
 * 70-75: Padarias, Materiais de construção, Comércio com fachada visível
 * < 70: Pequenos negócios (descartados no mapa para não poluir)
 */
export function classifyEstablishment(input: {
  tradeName?: string | null
  legalName: string
  cnaeCode?: string | null
  cnaeDescription?: string | null
  address?: string | null
}): {
  category: EstablishmentCategory
  importanceScore: number
  isRelevant: boolean
} {
  const combined = `${input.tradeName ?? ''} ${input.legalName} ${input.cnaeDescription ?? ''}`.toLowerCase()
  const cnae = input.cnaeCode?.replace(/\D/g, '') ?? ''

  // 1. Hospital e Saúde 24h (100)
  if (/hospital|pronto\s+socorro|upa|pronto\s+atendimento/i.test(combined) || cnae.startsWith('8610')) {
    return { category: 'hospital', importanceScore: 100, isRelevant: true }
  }

  // 2. Rodoviária (100)
  if (/terminal\s+rodovi[aá]rio|rodovi[aá]ria/i.test(combined) || cnae.startsWith('5222')) {
    return { category: 'rodoviaria', importanceScore: 100, isRelevant: true }
  }

  // 3. Órgãos Públicos / Prefeitura / Delegacia (95-100)
  if (/prefeitura|c[aâ]mara\s+municipal/i.test(combined) || cnae.startsWith('8411')) {
    return { category: 'orgao_publico', importanceScore: 100, isRelevant: true }
  }
  if (/delegacia|pol[ií]cia\s+civil|pol[ií]cia\s+militar/i.test(combined)) {
    return { category: 'orgao_publico', importanceScore: 95, isRelevant: true }
  }
  if (/correios|ag[eê]ncia\s+correios|ect/i.test(combined) || cnae.startsWith('5310')) {
    return { category: 'orgao_publico', importanceScore: 90, isRelevant: true }
  }

  // 4. Supermercados Grandes (95)
  if (
    /supermercado|hipermercado|atacad[aã]o|mercado\s+grande/i.test(combined) ||
    cnae.startsWith('4711') ||
    cnae.startsWith('4712')
  ) {
    return { category: 'supermercado', importanceScore: 95, isRelevant: true }
  }

  // 5. Postos de Combustível (95)
  if (
    /posto\s+de\s+combust[ií]vel|auto\s+posto|posto\s+br|posto\s+ipiranga|posto\s+shell/i.test(combined) ||
    cnae.startsWith('4731')
  ) {
    return { category: 'posto', importanceScore: 95, isRelevant: true }
  }

  // 6. Farmácias e Drogarias (90)
  if (/farm[aá]cia|drogaria/i.test(combined) || cnae.startsWith('4771')) {
    return { category: 'farmacia', importanceScore: 90, isRelevant: true }
  }

  // 7. Bancos e Cooperativas de Crédito (85)
  if (
    /banco\s+do\s+brasil|bradesco|itau|itaú|santander|caixa\s+econ[oô]mica|sicoob|sicredi/i.test(combined) ||
    cnae.startsWith('6422') ||
    cnae.startsWith('6424')
  ) {
    return { category: 'banco', importanceScore: 85, isRelevant: true }
  }

  // 8. Escolas e Colégios (85)
  if (/escola|col[eé]gio|educand[aá]rio/i.test(combined) || cnae.startsWith('8512') || cnae.startsWith('8513')) {
    return { category: 'escola', importanceScore: 85, isRelevant: true }
  }

  // 9. Igrejas e Templos Centrais (80)
  if (/igreja\s+matriz|par[oó]quia|catedral/i.test(combined) || cnae.startsWith('9491')) {
    return { category: 'igreja', importanceScore: 80, isRelevant: true }
  }

  // 10. Padarias e Confeitarias (75)
  if (/padaria|panificadora|confeitaria/i.test(combined) || cnae.startsWith('4721')) {
    return { category: 'padaria', importanceScore: 75, isRelevant: true }
  }

  // 11. Materiais de Construção (75)
  if (/materiais\s+(?:para\s+)?constru[cç][aã]o|dep[oó]sito\s+de\s+constru/i.test(combined) || cnae.startsWith('4744')) {
    return { category: 'materiais_construcao', importanceScore: 75, isRelevant: true }
  }

  // 12. Oficinas e Auto Centers (70)
  if (/oficina\s+mec[aâ]nica|auto\s+center|borracharia/i.test(combined) || cnae.startsWith('4520')) {
    return { category: 'oficina', importanceScore: 70, isRelevant: true }
  }

  // 13. Comércio Comum e Serviços de rua com fachada física (65)
  if (/mercearia|a[cç]ougue|loja\s+de|distribuidora/i.test(combined)) {
    return { category: 'comercio', importanceScore: 65, isRelevant: false }
  }

  // Pequenos negócios / MEI / empresas sem relevância geográfica como marco (50)
  return { category: 'outro', importanceScore: 50, isRelevant: false }
}
