import { describe, expect, it } from 'vitest'
import { isRoleAllowed, hasRequiredAreas } from '@/auth/permissions'
import type { Role } from '@/domain/types'

describe('permissions', () => {
  it('allows when roles not provided', () => {
    expect(isRoleAllowed('VENDEDOR' as Role)).toBe(true)
  })

  it('checks role list', () => {
    expect(isRoleAllowed('OWNER' as Role, ['OWNER', 'ADMIN'])).toBe(true)
    expect(isRoleAllowed('VENDEDOR' as Role, ['OWNER', 'ADMIN'])).toBe(false)
  })

  it('checks areas any/all', () => {
    const areas = ['ADM_ROOT', 'RELATORIOS']
    expect(hasRequiredAreas(areas, ['RELATORIOS'], 'any')).toBe(true)
    expect(hasRequiredAreas(areas, ['RELATORIOS', 'CONFIG'], 'all')).toBe(false)
  })
})
