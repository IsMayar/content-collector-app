import type { Me } from '@/api/types'
export const demoPassword = 'ContentDemo!2026'
export const agencyId = '11111111-1111-4111-8111-111111111111'
export const soloId = '22222222-2222-4222-8222-222222222222'
const agency = {
  memberId: 'a1111111-1111-4111-8111-111111111111',
  workspaceId: agencyId,
  workspaceName: 'Northstar Studio',
  role: 'OWNER' as const,
}
const solo = {
  memberId: 'b2222222-2222-4222-8222-222222222222',
  workspaceId: soloId,
  workspaceName: 'Juniper Creative',
  role: 'OWNER' as const,
}
export interface MockAccount extends Me {
  password: string
}
export function accountFixtures(): Record<string, MockAccount> {
  return {
    'owner@studio.example': {
      user: {
        id: '01111111-1111-4111-8111-111111111111',
        email: 'owner@studio.example',
        displayName: 'Alex Morgan',
        verified: true,
      },
      memberships: [
        agency,
        {
          ...solo,
          memberId: 'b1111111-1111-4111-8111-111111111111',
          role: 'MEMBER',
        },
      ],
      password: demoPassword,
    },
    'solo@studio.example': {
      user: {
        id: '02222222-2222-4222-8222-222222222222',
        email: 'solo@studio.example',
        displayName: 'Sam Rivera',
        verified: true,
      },
      memberships: [solo],
      password: demoPassword,
    },
    'member@studio.example': {
      user: {
        id: '03333333-3333-4333-8333-333333333333',
        email: 'member@studio.example',
        displayName: 'Jamie Chen',
        verified: true,
      },
      memberships: [
        {
          ...agency,
          memberId: 'a3333333-3333-4333-8333-333333333333',
          role: 'MEMBER',
        },
      ],
      password: demoPassword,
    },
    'unverified@studio.example': {
      user: {
        id: '04444444-4444-4444-8444-444444444444',
        email: 'unverified@studio.example',
        displayName: 'Taylor Reed',
        verified: false,
      },
      memberships: [],
      password: demoPassword,
    },
  }
}
