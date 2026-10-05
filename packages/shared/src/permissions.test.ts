import { describe, expect, it } from 'vitest'
import { can } from './permissions'

describe('permissões', () => {
  it('administrador revisa correções e gerencia usuários', () => {
    expect(can('ADMIN', 'correction:review')).toBe(true)
    expect(can('ADMIN', 'user:manage')).toBe(true)
    expect(can('ADMIN', 'street:write')).toBe(true)
  })

  it('editor altera o mapa e não gerencia usuários', () => {
    expect(can('EDITOR', 'street:write')).toBe(true)
    expect(can('EDITOR', 'correction:review')).toBe(true)
    expect(can('EDITOR', 'user:manage')).toBe(false)
  })

  it('entregador envia correção e ponto de entrega, sem editar rua', () => {
    expect(can('DELIVERY_DRIVER', 'correction:create')).toBe(true)
    expect(can('DELIVERY_DRIVER', 'delivery:write')).toBe(true)
    expect(can('DELIVERY_DRIVER', 'street:write')).toBe(false)
    expect(can('DELIVERY_DRIVER', 'correction:review')).toBe(false)
  })

  it('usuário consulta e sugere correção', () => {
    expect(can('USER', 'catalog:read')).toBe(true)
    expect(can('USER', 'correction:create')).toBe(true)
    expect(can('USER', 'delivery:write')).toBe(false)
  })
})
