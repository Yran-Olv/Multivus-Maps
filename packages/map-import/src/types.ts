export type MatchType =
  | 'MATCH_EXACT'
  | 'MATCH_ALIAS'
  | 'MATCH_FUZZY'
  | 'CONFLICT'
  | 'NEW_STREET'
  | 'UNRESOLVED'

export type ImportAction =
  | 'APPLY_GEOMETRY'
  | 'REVIEW_REQUIRED'
  | 'CREATE_STREET'
  | 'IGNORE'

export type OsmGeometry = {
  type: 'LineString' | 'MultiLineString'
  coordinates: [number, number][] | [number, number][][]
}

export type OsmStreetFeature = {
  osmId: string
  name: string
  normalizedName: string
  streetType?: string
  highway: string
  geometry: OsmGeometry
  tags: Record<string, string>
  aliases: string[]
  oneway?: boolean | null
  maxspeed?: string | null
  surface?: string | null
}

export type MatchConflict = {
  candidateId: string
  candidateName: string
  score: number
  reason: string
}

export type MatchResult = {
  osmFeature: OsmStreetFeature
  multivusStreetId: string | null
  multivusOfficialName: string | null
  matchedAlias: string | null
  matchType: MatchType
  score: number
  action: ImportAction
  conflicts: MatchConflict[]
  reason: string
}

export type ImportReportSummary = {
  totalOsmFeatures: number
  exact: number
  alias: number
  fuzzy: number
  conflict: number
  newStreet: number
  unresolved: number
}

export type ImportReportItem = {
  source_name: string
  multivus_name: string | null
  match_type: MatchType
  score: number
  action: ImportAction
  conflicts: MatchConflict[]
  osm_id: string
  street_type?: string
  matched_alias?: string | null
  multivus_street_id?: string | null
  geometry: OsmGeometry
}

export type ImportReport = {
  batchName: string
  city: string
  sourceFile: string
  generatedAt: string
  summary: ImportReportSummary
  items: ImportReportItem[]
}

export type MultivusStreetCandidate = {
  id: string
  officialName: string
  normalizedName: string
  streetType: string
  neighborhoodId?: string | null
  neighborhoodName?: string | null
  verified: boolean
  confidenceScore: number
  geometry?: unknown | null
  aliases: Array<{
    alias: string
    normalizedAlias: string
    aliasType: string
  }>
}
