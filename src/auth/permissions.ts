import type { Role } from '@/domain/types'

export function isRoleAllowed(role: Role, roles?: Role | Role[]) {
  if (!roles) return true
  const list = Array.isArray(roles) ? roles : [roles]
  return list.includes(role)
}

export function hasRequiredAreas(
  areas: string[],
  required: string[],
  mode: 'any' | 'all'
) {
  if (required.length === 0) return true
  return mode === 'all'
    ? required.every(a => areas.includes(a))
    : required.some(a => areas.includes(a))
}
