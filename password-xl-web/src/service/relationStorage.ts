import type { PasswordRelation, StoreData } from '@/types'
import { decryptAES, encryptAES } from '@/utils/security.ts'
import { parseRelations } from '@/utils/passwordRelations.ts'

export const readRelations = (
  store: Pick<StoreData, 'relationData'>,
  mainPassword: string,
  ids?: ReadonlySet<number>,
): PasswordRelation[] => {
  if (store.relationData === undefined) return []
  if (typeof store.relationData !== 'string' || !store.relationData)
    throw new Error('关联数据格式错误')
  return parseRelations(JSON.parse(decryptAES(mainPassword, store.relationData)), ids)
}

export const encryptRelations = (relations: PasswordRelation[], mainPassword: string): string =>
  encryptAES(mainPassword, JSON.stringify(parseRelations(relations)))
