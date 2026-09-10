import type {GenerateRule, PasswordCharacterRatios, PasswordCharacterType, PasswordExclusions, Setting} from '../types/index.ts'

export const DEFAULT_CONFUSING_CHARACTERS = '0Oo1Ili'
// 默认排除的配置语法和 shell 特殊符号，按使用偏好保留 !@&()_-.,。
// 写入配置仍须遵循目标格式的字符串语法。
export const CONFIG_SPECIAL_CHARACTERS = '~#$%^*+=;'
export const DEFAULT_EXCLUDED_CHARACTERS = DEFAULT_CONFUSING_CHARACTERS + CONFIG_SPECIAL_CHARACTERS
export const PASSWORD_EXCLUSIONS_DEFAULTS_VERSION = 1
export const PASSWORD_CHARACTER_TYPES = ['uppercase', 'lowercase', 'symbol', 'number'] as const
export const passwordDist: Record<PasswordCharacterType, string> = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  symbol: '~!@#$%^&*()_-+=.,;',
  number: '0123456789',
}

export const PASSWORD_CHARACTER_LABELS: Record<PasswordCharacterType, string> = {
  uppercase: '大写', lowercase: '小写', symbol: '符号', number: '数字',
}

const toRatios = (values: number[]): PasswordCharacterRatios => Object.fromEntries(
  PASSWORD_CHARACTER_TYPES.map((type, index) => [type, values[index]])
) as PasswordCharacterRatios

// 最大余数法：保持整数占比之和为 100，字符数量之和等于密码长度。
const distribute = (total: number, weights: number[]): number[] => {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (!sum) return weights.map(() => 0)
  const exact = weights.map(weight => weight / sum * total)
  const result = exact.map(Math.floor)
  const order = weights.map((_, index) => index).sort((a, b) =>
    (exact[b] - result[b]) - (exact[a] - result[a]) || a - b)
  const remaining = total - result.reduce((a, b) => a + b, 0)
  for (let index = 0; index < remaining; index++) result[order[index]]++
  return result
}

export const defaultGenerateRule = (): GenerateRule => ({
  length: 16, uppercase: true, lowercase: true, symbol: true, number: true,
  ratios: toRatios([25, 25, 25, 25]),
})

export const defaultPasswordExclusions = (): PasswordExclusions => ({
  enabled: true,
  characters: DEFAULT_EXCLUDED_CHARACTERS,
  defaultsVersion: PASSWORD_EXCLUSIONS_DEFAULTS_VERSION,
})

export const getCharacterRatios = (rule: GenerateRule): PasswordCharacterRatios => {
  const weights = PASSWORD_CHARACTER_TYPES.map(type => {
    if (!rule[type]) return 0
    const ratio = rule.ratios?.[type]
    // 新增密码表单仍使用类型开关；重新勾选原本为 0 的类型时给它默认权重。
    return typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0 ? Math.min(100, ratio) : 25
  })
  return toRatios(distribute(100, weights))
}

export const setCharacterRatios = (rule: GenerateRule, ratios: PasswordCharacterRatios): GenerateRule => ({
  ...rule,
  ...Object.fromEntries(PASSWORD_CHARACTER_TYPES.map(type => [type, ratios[type] > 0])),
  ratios: {...ratios},
})

export const rebalanceCharacterRatios = (
  ratios: PasswordCharacterRatios, type: PasswordCharacterType, value: number
): PasswordCharacterRatios => {
  const selected = PASSWORD_CHARACTER_TYPES.indexOf(type)
  const nextValue = Math.min(100, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)))
  let weights = PASSWORD_CHARACTER_TYPES.map(key => key === type ? 0 : ratios[key])
  // 从单一类型降低比例时，重新分配给其余类型，避免全部归零。
  if (!weights.some(Boolean)) weights = PASSWORD_CHARACTER_TYPES.map(key => key === type ? 0 : 1)
  const next = distribute(100 - nextValue, weights)
  next[selected] = nextValue
  return toRatios(next)
}

const configuredExcludedCharacters = (exclusions: PasswordExclusions): string => {
  const characters = typeof exclusions.characters === 'string'
    ? exclusions.characters
    : DEFAULT_EXCLUDED_CHARACTERS + (typeof exclusions.additional === 'string' ? exclusions.additional : '')
  return [...new Set(characters)].join('')
}

export const getExcludedCharacters = (exclusions: PasswordExclusions): string => exclusions.enabled
  ? configuredExcludedCharacters(exclusions) : ''

export const normalizePasswordGenerationSettings = (setting: Setting, source: Partial<Setting> = setting) => {
  const rule = source.generateRule ?? defaultGenerateRule()
  const ratios = getCharacterRatios(rule)
  const length = Number.isInteger(rule.length) ? Math.min(32, Math.max(4, rule.length)) : 16
  setting.generateRule = Object.values(ratios).some(Boolean)
    ? setCharacterRatios({...rule, length}, ratios)
    : {...defaultGenerateRule(), length}

  const saved = source.passwordExclusions
  if (saved) {
    const characters = configuredExcludedCharacters(saved)
    // 给已有配置补上新的默认排除符号；只迁移一次，之后保留用户的增删。
    const additions = (saved.defaultsVersion ?? 0) < PASSWORD_EXCLUSIONS_DEFAULTS_VERSION ? CONFIG_SPECIAL_CHARACTERS : ''
    setting.passwordExclusions = {
      enabled: saved.enabled !== false,
      characters: [...new Set(characters + additions)].join(''),
      defaultsVersion: PASSWORD_EXCLUSIONS_DEFAULTS_VERSION,
    }
  } else {
    const legacy = typeof source.easyConfuseChat === 'string' ? source.easyConfuseChat : DEFAULT_EXCLUDED_CHARACTERS
    setting.passwordExclusions = {
      enabled: legacy.length > 0,
      characters: [...new Set(DEFAULT_EXCLUDED_CHARACTERS + legacy)].join(''),
      defaultsVersion: PASSWORD_EXCLUSIONS_DEFAULTS_VERSION,
    }
  }
  // 同时保留旧字段，旧客户端仍能读取实际排除内容。
  setting.easyConfuseChat = getExcludedCharacters(setting.passwordExclusions)
}

const secureRandomInt = (max: number): number => {
  if (!globalThis.crypto?.getRandomValues) throw new Error('当前环境不支持安全随机数')
  const array = new Uint32Array(1)
  const limit = Math.floor(0x100000000 / max) * max
  do {
    globalThis.crypto.getRandomValues(array)
  } while (array[0] >= limit)
  return array[0] % max
}

export const generatePassword = (rule: GenerateRule, excludedCharacters = ''): string => {
  if (!Number.isInteger(rule.length) || rule.length < 4 || rule.length > 32) {
    throw new Error('密码长度应为 4 至 32 位整数')
  }
  const ratios = getCharacterRatios(rule)
  const activeTypes = PASSWORD_CHARACTER_TYPES.filter(type => ratios[type] > 0)
  if (!activeTypes.length) throw new Error('请至少启用一种字符类型')
  const excluded = new Set(excludedCharacters)
  const pools = activeTypes.map(type => [...passwordDist[type]].filter(char => !excluded.has(char)))
  const invalidTypes = activeTypes.filter((_, index) => !pools[index].length)
  if (invalidTypes.length) {
    throw new Error(`${invalidTypes.map(type => PASSWORD_CHARACTER_LABELS[type]).join('、')}的可用字符已全部被排除，请调整排除内容或比例`)
  }

  const weights = activeTypes.map(type => ratios[type])
  const counts = distribute(rule.length, weights)
  for (let index = 0; index < counts.length; index++) {
    if (counts[index] !== 0) continue
    // 低比例在短密码中也至少分到一个字符，从超出目标最多的类型调剂。
    const donor = counts.map((_, i) => i).filter(i => counts[i] > 1).sort((a, b) =>
      (counts[b] - rule.length * weights[b] / 100) - (counts[a] - rule.length * weights[a] / 100) || a - b)[0]
    counts[donor]--
    counts[index]++
  }
  const password: string[] = []
  counts.forEach((count, index) => {
    for (let i = 0; i < count; i++) password.push(pools[index][secureRandomInt(pools[index].length)])
  })
  for (let i = password.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1)
    ;[password[i], password[j]] = [password[j], password[i]]
  }
  return password.join('')
}
