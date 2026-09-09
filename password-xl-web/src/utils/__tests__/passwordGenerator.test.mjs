import assert from 'node:assert/strict'
import {test, mock} from 'node:test'
import {
  DEFAULT_CONFUSING_CHARACTERS,
  CONFIG_SPECIAL_CHARACTERS,
  DEFAULT_EXCLUDED_CHARACTERS,
  PASSWORD_EXCLUSIONS_DEFAULTS_VERSION,
  PASSWORD_CHARACTER_TYPES,
  defaultGenerateRule,
  defaultPasswordExclusions,
  generatePassword,
  getCharacterRatios,
  getExcludedCharacters,
  normalizePasswordGenerationSettings,
  passwordDist,
  rebalanceCharacterRatios,
  setCharacterRatios,
} from '../passwordGenerator.ts'

const countTypes = password => Object.fromEntries(PASSWORD_CHARACTER_TYPES.map(type =>
  [type, [...password].filter(char => passwordDist[type].includes(char)).length]))

test('default passwords use four equal types and exclude confusing and configuration symbols', () => {
  const excluded = getExcludedCharacters(defaultPasswordExclusions())
  assert.equal(excluded, DEFAULT_EXCLUDED_CHARACTERS)
  assert.equal([...passwordDist.symbol].filter(char => !excluded.includes(char)).join(''), '!@&()_-.,')
  for (let i = 0; i < 20; i++) {
    const password = generatePassword(defaultGenerateRule(), excluded)
    assert.equal(password.length, 16)
    assert.deepEqual(countTypes(password), {uppercase: 4, lowercase: 4, symbol: 4, number: 4})
    assert.ok([...password].every(char => !excluded.includes(char)))
  }
})

test('a changed ratio preserves the sum and allocates character counts close to its target', () => {
  const ratios = rebalanceCharacterRatios(defaultGenerateRule().ratios, 'uppercase', 70)
  assert.deepEqual(ratios, {uppercase: 70, lowercase: 10, symbol: 10, number: 10})
  const rule = setCharacterRatios(defaultGenerateRule(), ratios)
  assert.deepEqual(countTypes(generatePassword(rule)), {uppercase: 11, lowercase: 2, symbol: 2, number: 1})
})

test('0% disables a type and a single 100% type can be reduced without leaving all types off', () => {
  let ratios = rebalanceCharacterRatios(defaultGenerateRule().ratios, 'uppercase', 100)
  const rule = setCharacterRatios(defaultGenerateRule(), ratios)
  assert.match(generatePassword(rule), /^[A-Z]{16}$/)
  assert.equal(rule.symbol, false)
  ratios = rebalanceCharacterRatios(ratios, 'uppercase', 0)
  assert.equal(ratios.uppercase, 0)
  assert.equal(Object.values(ratios).reduce((a, b) => a + b), 100)
  assert.equal(countTypes(generatePassword(setCharacterRatios(rule, ratios))).uppercase, 0)
})

test('every enabled type occurs even in a four-character password with a very small ratio', () => {
  const rule = setCharacterRatios({...defaultGenerateRule(), length: 4}, {
    uppercase: 97, lowercase: 1, symbol: 1, number: 1,
  })
  assert.deepEqual(countTypes(generatePassword(rule)), {uppercase: 1, lowercase: 1, symbol: 1, number: 1})
})

test('all allowed lengths and slider positions preserve totals and enabled types', () => {
  for (let length = 4; length <= 32; length++) {
    for (let value = 0; value <= 100; value++) {
      const ratios = rebalanceCharacterRatios(defaultGenerateRule().ratios, 'symbol', value)
      assert.equal(Object.values(ratios).reduce((a, b) => a + b), 100)
      const rule = setCharacterRatios({...defaultGenerateRule(), length}, ratios)
      const password = generatePassword(rule, DEFAULT_EXCLUDED_CHARACTERS)
      const counts = countTypes(password)
      assert.equal(password.length, length)
      for (const type of PASSWORD_CHARACTER_TYPES) assert.equal(counts[type] > 0, rule[type])
    }
  }
})

test('existing password-form checkboxes override copied ratios, including re-enabling a 0% type', () => {
  const rule = setCharacterRatios(defaultGenerateRule(), {uppercase: 35, lowercase: 35, symbol: 0, number: 30})
  assert.equal(countTypes(generatePassword(rule)).symbol, 0)
  rule.symbol = true
  assert.ok(countTypes(generatePassword(rule)).symbol > 0)
  rule.uppercase = false
  assert.equal(countTypes(generatePassword(rule)).uppercase, 0)
})

test('legacy generation rules and exclusion text survive merging into new defaults', () => {
  const saved = {
    generateRule: {length: 20, uppercase: false, lowercase: true, symbol: false, number: true},
    easyConfuseChat: '0OoIil@##%zz',
  }
  const setting = {generateRule: defaultGenerateRule(), passwordExclusions: {enabled: true, additional: ''}, ...saved}
  normalizePasswordGenerationSettings(setting, saved)
  assert.deepEqual(setting.generateRule.ratios, {uppercase: 0, lowercase: 50, symbol: 0, number: 50})
  assert.equal(setting.generateRule.length, 20)
  assert.deepEqual(setting.passwordExclusions, {
    enabled: true,
    characters: DEFAULT_EXCLUDED_CHARACTERS + '@z',
    defaultsVersion: PASSWORD_EXCLUSIONS_DEFAULTS_VERSION,
  })
  assert.ok([...saved.easyConfuseChat].every(char => setting.easyConfuseChat.includes(char)))
  assert.ok(setting.easyConfuseChat.includes('1'))
  const savedAgain = JSON.stringify(setting)
  normalizePasswordGenerationSettings(setting)
  assert.equal(JSON.stringify(setting), savedAgain)
})

test('a legacy empty exclusion remains off instead of inheriting new defaults', () => {
  const saved = {easyConfuseChat: ''}
  const setting = {generateRule: defaultGenerateRule(), passwordExclusions: {enabled: true, additional: ''}, ...saved}
  normalizePasswordGenerationSettings(setting, saved)
  assert.deepEqual(setting.passwordExclusions, {
    enabled: false,
    characters: DEFAULT_EXCLUDED_CHARACTERS,
    defaultsVersion: PASSWORD_EXCLUSIONS_DEFAULTS_VERSION,
  })
  assert.equal(setting.easyConfuseChat, '')
})

test('saved new exclusions preserve additional text while disabled and restore it on re-enable', () => {
  const setting = {generateRule: defaultGenerateRule(), passwordExclusions: {enabled: false, additional: '@##%zz'}, easyConfuseChat: 'stale'}
  normalizePasswordGenerationSettings(setting)
  assert.equal(setting.passwordExclusions.characters, DEFAULT_EXCLUDED_CHARACTERS + '@z')
  assert.equal(setting.easyConfuseChat, '')
  setting.passwordExclusions.enabled = true
  assert.ok(getExcludedCharacters(setting.passwordExclusions).endsWith('z'))
})

test('the full default exclusion value is editable and remains unchanged after save/reload', () => {
  const setting = {generateRule: defaultGenerateRule()}
  normalizePasswordGenerationSettings(setting)
  assert.equal(setting.passwordExclusions.characters, DEFAULT_EXCLUDED_CHARACTERS)
  for (const characters of ['0Oo', '@#%', '']) {
    setting.passwordExclusions.characters = characters
    assert.equal(getExcludedCharacters(setting.passwordExclusions), characters)
    const saved = JSON.parse(JSON.stringify(setting))
    normalizePasswordGenerationSettings(setting, saved)
    assert.equal(setting.passwordExclusions.characters, characters)
    assert.equal(setting.easyConfuseChat, characters)
  }
})

test('previous full exclusion settings gain configuration symbols exactly once', () => {
  for (const enabled of [true, false]) {
    const setting = {
      generateRule: defaultGenerateRule(),
      passwordExclusions: {enabled, characters: DEFAULT_CONFUSING_CHARACTERS + 'z'},
    }
    normalizePasswordGenerationSettings(setting)
    assert.equal(setting.passwordExclusions.enabled, enabled)
    assert.equal(setting.passwordExclusions.characters, DEFAULT_CONFUSING_CHARACTERS + 'z' + CONFIG_SPECIAL_CHARACTERS)
    assert.equal(setting.passwordExclusions.defaultsVersion, PASSWORD_EXCLUSIONS_DEFAULTS_VERSION)
    assert.equal(setting.easyConfuseChat, enabled ? setting.passwordExclusions.characters : '')

    // 默认迁移后手动保留美元符号或清空，重新载入时不再补回。
    for (const characters of [setting.passwordExclusions.characters.replace('$', ''), '']) {
      setting.passwordExclusions.characters = characters
      normalizePasswordGenerationSettings(setting)
      assert.equal(setting.passwordExclusions.characters, characters)
    }
  }
})

test('100% symbols uses the retained symbols with default exclusions', () => {
  const rule = setCharacterRatios(defaultGenerateRule(), {uppercase: 0, lowercase: 0, symbol: 100, number: 0})
  const password = generatePassword(rule, getExcludedCharacters(defaultPasswordExclusions()))
  assert.equal(password.length, 16)
  assert.ok([...password].every(char => '!@&()_-.,'.includes(char)))
  assert.throws(() => generatePassword(rule, DEFAULT_EXCLUDED_CHARACTERS + passwordDist.symbol), /符号的可用字符已全部被排除/)
})

test('a fully excluded enabled pool is rejected instead of silently dropping that character type', () => {
  assert.throws(() => generatePassword(defaultGenerateRule(), passwordDist.uppercase), /大写的可用字符已全部被排除/)
  const rule = {...defaultGenerateRule(), uppercase: false}
  assert.equal(generatePassword(rule, passwordDist.uppercase).length, 16)
  assert.throws(() => generatePassword({...rule, lowercase: false, symbol: false, number: false}), /至少启用一种/)
})

test('invalid lengths are rejected and malformed saved preferences are normalized', () => {
  for (const length of [0, 3, 33, -1, NaN, Infinity, 16.5]) {
    assert.throws(() => generatePassword({...defaultGenerateRule(), length}), /密码长度/)
  }
  const setting = {generateRule: {...defaultGenerateRule(), length: 200, ratios: {uppercase: NaN, lowercase: -1, symbol: Infinity, number: 25}}}
  normalizePasswordGenerationSettings(setting)
  assert.equal(setting.generateRule.length, 32)
  assert.deepEqual(getCharacterRatios(setting.generateRule), defaultGenerateRule().ratios)
})

test('secure random selection rejects values outside the unbiased range', () => {
  let calls = 0
  const stub = mock.method(globalThis.crypto, 'getRandomValues', array => {
    array[0] = ++calls === 1 ? 0xffffffff : 0
    return array
  })
  try {
    const rule = {...defaultGenerateRule(), lowercase: false, symbol: false, number: false}
    assert.equal(generatePassword(rule), 'A'.repeat(16))
    assert.equal(calls, 32) // 16 characters, 15 shuffle steps, one rejected random value.
  } finally {
    stub.mock.restore()
  }
})

test('generation fails when secure randomness is unavailable', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  Object.defineProperty(globalThis, 'crypto', {configurable: true, value: undefined})
  try {
    assert.throws(() => generatePassword(defaultGenerateRule()), /不支持安全随机数/)
  } finally {
    Object.defineProperty(globalThis, 'crypto', descriptor)
  }
})
