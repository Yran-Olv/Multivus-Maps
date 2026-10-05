import { ACTIONS, type Action, type Role } from './constants'

const ALL = [...ACTIONS]

const EDITOR: Action[] = [
  'catalog:read',
  'correction:create',
  'correction:review',
  'street:write',
  'restriction:write',
  'place:write',
  'neighborhood:write',
  'audit:read',
  'delivery:write',
  'favorite:write',
]

const DRIVER: Action[] = ['catalog:read', 'correction:create', 'delivery:write', 'favorite:write']

const USER: Action[] = ['catalog:read', 'correction:create', 'favorite:write']

const MATRIX: Record<Role, readonly Action[]> = {
  ADMIN: ALL,
  EDITOR,
  DELIVERY_DRIVER: DRIVER,
  USER,
}

export function permissionsFor(role: Role): readonly Action[] {
  return MATRIX[role]
}

export function can(role: Role, action: Action): boolean {
  return MATRIX[role].includes(action)
}
