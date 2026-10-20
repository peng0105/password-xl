import type { Label, Password, PasswordRelation } from '@/types'
import { mergeLabel, mergePassword } from '@/utils/global.ts'
import { normalizePasswordArray } from '@/utils/passwordFieldOrder.ts'
import { mergeRelations, parseRelations } from '@/utils/passwordRelations.ts'

export interface PasswordRecoveryData {
  passwords: Password[]
  labels: Label[]
  relations: PasswordRelation[]
}

// 在独立副本上完成映射和校验，任一步失败都不能污染当前库或备份草稿。
export const preparePasswordRecovery = (
  current: PasswordRecoveryData,
  recovered: PasswordRecoveryData,
  mode: 'cover' | 'merge',
): PasswordRecoveryData => {
  const incoming: PasswordRecoveryData = JSON.parse(JSON.stringify(recovered))
  normalizePasswordArray(incoming.passwords)
  const incomingIds = new Set(incoming.passwords.map((password) => password.id))
  if (incomingIds.size !== incoming.passwords.length) {
    throw new Error('备份中存在重复的密码 ID，无法确定关联归属')
  }
  incoming.relations = parseRelations(incoming.relations, incomingIds)
  if (!Array.isArray(incoming.labels)) {
    throw new Error('备份中的标签格式错误')
  }
  if (mode === 'cover') {
    return incoming
  }

  const result: PasswordRecoveryData = JSON.parse(JSON.stringify(current))
  const labelIds = mergeLabel(result.labels, incoming.labels)
  incoming.passwords.forEach((password) => {
    password.labels = password.labels.map((id) => labelIds.get(id) ?? id)
  })
  const passwordIds = mergePassword(result.passwords, incoming.passwords)
  result.relations = mergeRelations(result.relations, incoming.relations, passwordIds)
  result.relations = parseRelations(
    result.relations,
    new Set(result.passwords.map((password) => password.id)),
  )
  return result
}
