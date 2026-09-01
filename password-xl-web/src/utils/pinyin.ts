type PinyinMatcher = typeof import('pinyin-pro')['match']

let pinyinMatcher: PinyinMatcher | null = null
let pinyinMatcherLoader: Promise<PinyinMatcher> | null = null

// 加载拼音匹配器。复用同一个 Promise，避免预加载和搜索同时触发重复请求。
export const loadPinyinMatcher = (): Promise<PinyinMatcher> => {
    if (pinyinMatcher) {
        return Promise.resolve(pinyinMatcher)
    }
    if (!pinyinMatcherLoader) {
        pinyinMatcherLoader = import('pinyin-pro')
            .then(module => {
                pinyinMatcher = module.match
                return pinyinMatcher
            })
            .catch(error => {
                pinyinMatcherLoader = null
                throw error
            })
    }
    return pinyinMatcherLoader
}

// 首屏挂载后在浏览器空闲时预加载，避免占用首屏关键资源。
export const preloadPinyinMatcher = () => {
    const preload = () => {
        loadPinyinMatcher().catch(error => {
            console.error('拼音搜索模块预加载失败', error)
        })
    }

    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(preload, {timeout: 2000})
    } else {
        globalThis.setTimeout(preload, 1000)
    }
}

export const matchPinyin = (value: string, searchText: string): boolean => {
    if (!pinyinMatcher) {
        return false
    }
    return Boolean(pinyinMatcher(value, searchText, {
        continuous: true,
        precision: 'start',
        insensitive: true,
        v: true,
    }))
}
