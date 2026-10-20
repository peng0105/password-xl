import type { PasswordRelation, RelationDirection } from '@/types'

export const relationKey = (sourceId: number, targetId: number): string =>
  sourceId < targetId ? `${sourceId}:${targetId}` : `${targetId}:${sourceId}`

// 密文中的结构错误必须显式失败，不能当成空关系覆盖保存。
export const parseRelations = (
  value: unknown,
  passwordIds?: ReadonlySet<number>,
): PasswordRelation[] => {
  if (!Array.isArray(value)) throw new Error('关联数据格式错误')
  const keys = new Set<string>()
  return value.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('关联数据格式错误')
    const { sourceId, targetId, directed } = item as Partial<PasswordRelation>
    if (
      !Number.isSafeInteger(sourceId) ||
      !Number.isSafeInteger(targetId) ||
      sourceId! <= 0 ||
      targetId! <= 0 ||
      sourceId === targetId ||
      typeof directed !== 'boolean'
    ) {
      throw new Error('关联数据格式错误')
    }
    if (passwordIds && (!passwordIds.has(sourceId!) || !passwordIds.has(targetId!))) {
      throw new Error('关联的密码不存在')
    }
    const key = relationKey(sourceId!, targetId!)
    if (keys.has(key)) throw new Error('存在重复的密码关联')
    keys.add(key)
    return !directed && sourceId! > targetId!
      ? { sourceId: targetId!, targetId: sourceId!, directed }
      : { sourceId: sourceId!, targetId: targetId!, directed }
  })
}

export const makeRelation = (
  currentId: number,
  otherId: number,
  direction: RelationDirection,
): PasswordRelation =>
  direction === 'incoming'
    ? { sourceId: otherId, targetId: currentId, directed: true }
    : { sourceId: currentId, targetId: otherId, directed: direction === 'outgoing' }

export const relationDirection = (
  relation: PasswordRelation,
  currentId: number,
): RelationDirection =>
  !relation.directed ? 'undirected' : relation.targetId === currentId ? 'incoming' : 'outgoing'

export const buildRelationIndex = (
  relations: readonly PasswordRelation[],
  activeIds: ReadonlySet<number>,
) => {
  const index = new Map<number, Map<number, PasswordRelation>>()
  for (const relation of relations) {
    if (!activeIds.has(relation.sourceId) || !activeIds.has(relation.targetId)) continue
    for (const [id, otherId] of [
      [relation.sourceId, relation.targetId],
      [relation.targetId, relation.sourceId],
    ]) {
      if (!index.has(id)) index.set(id, new Map())
      index.get(id)!.set(otherId, relation)
    }
  }
  return index
}

export const connectedPasswordIds = (
  rootId: number,
  index: ReturnType<typeof buildRelationIndex>,
): Set<number> => {
  const visited = new Set([rootId])
  const pending = [rootId]
  for (let i = 0; i < pending.length; i++) {
    for (const id of index.get(pending[i])?.keys() || []) {
      if (visited.has(id)) continue
      visited.add(id)
      pending.push(id)
    }
  }
  return visited
}

export const directionalPasswordIds = (
  rootId: number,
  index: ReturnType<typeof buildRelationIndex>,
  direction: RelationDirection,
  includeIndirect = false,
  rootRelations: ReadonlyMap<number, PasswordRelation> | undefined = index.get(rootId),
): Set<number> => {
  const visited = new Set([rootId])
  const result = new Set<number>()
  const pending = [rootId]
  for (let i = 0; i < pending.length; i++) {
    const currentId = pending[i]
    // 新增密码以草稿关系作为第一层，后续仍读取现有密码的有效关系。
    const neighbors = currentId === rootId ? rootRelations : index.get(currentId)
    for (const [otherId, relation] of neighbors || []) {
      if (visited.has(otherId) || relationDirection(relation, currentId) !== direction) continue
      visited.add(otherId)
      result.add(otherId)
      if (includeIndirect && direction !== 'undirected') pending.push(otherId)
    }
  }
  return result
}

// 删除边是清理；新增边或改变方向是修改，不能绕过存储配额。
export const relationsModified = (
  previous: readonly PasswordRelation[],
  next: readonly PasswordRelation[],
): boolean => {
  const old = new Map(previous.map((r) => [relationKey(r.sourceId, r.targetId), r]))
  return next.some((r) => {
    const before = old.get(relationKey(r.sourceId, r.targetId))
    return (
      !before || before.directed !== r.directed || (r.directed && before.sourceId !== r.sourceId)
    )
  })
}

export const mergeRelations = (
  current: readonly PasswordRelation[],
  imported: readonly PasswordRelation[],
  idMap: ReadonlyMap<number, number>,
): PasswordRelation[] => {
  const merged = new Map(current.map((r) => [relationKey(r.sourceId, r.targetId), { ...r }]))
  for (const relation of imported) {
    const sourceId = idMap.get(relation.sourceId)
    const targetId = idMap.get(relation.targetId)
    if (sourceId === undefined || targetId === undefined) throw new Error('无法恢复关联的密码')
    if (sourceId === targetId) continue
    const key = relationKey(sourceId, targetId)
    if (!merged.has(key)) merged.set(key, { sourceId, targetId, directed: relation.directed })
  }
  return parseRelations([...merged.values()])
}
