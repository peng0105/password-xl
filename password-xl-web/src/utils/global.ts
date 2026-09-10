import {ElMessage} from "element-plus";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {GenerateRule, Label, Password} from "@/types";
import {useSettingStore} from "@/stores/SettingStore.ts";
import {encryptAES} from "@/utils/security.ts";
import CryptoJS from 'crypto-js'
import {matchPinyin} from '@/utils/pinyin.ts'
import {getOrderedPasswordFields} from "@/utils/passwordFieldOrder.ts";
import {generatePassword, getExcludedCharacters} from '@/utils/passwordGenerator.ts'
export {passwordDist} from '@/utils/passwordGenerator.ts'

// 判断字符串是否为url
export const isUrl = (str: string) => {
    return str && /^.*:\/\/.*$/.test(str)
}

const displaySizeValue = ref('')
export const displaySize = () => {
    let width = window.innerWidth
    if (width < 768) {
        displaySizeValue.value = 'xs'
    } else if (width >= 768 && width < 992) {
        displaySizeValue.value = 'sm';
    } else if (width >= 992 && width < 1200) {
        displaySizeValue.value = 'md';
    } else if (width >= 1200 && width < 1920) {
        displaySizeValue.value = 'lg';
    } else {
        displaySizeValue.value = 'xl';
    }
    return displaySizeValue;
}

window.onresize = () => {
    displaySize()
}

// 复制文本
export async function copyText(text: string, silent: boolean = false) {
    let textarea = document.createElement('textarea');
    textarea.setAttribute('readonly', 'readonly');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.setSelectionRange(0, textarea.value.length);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea)
    if (!silent) {
        ElMessage.success('复制成功');
    }
    console.log('复制到剪切板成功')
}

type SearchField = string | number | null | undefined;

const searchTokens = (searchText: string): Array<string> => {
    if (!searchText) return []
    return searchText.trim().split(/\s+/).filter(Boolean)
}

// 单字段文本搜索
export const searchStr = (searchText: string, value: SearchField): boolean => {
    if (!value) return false;
    if (!searchText) return false;

    try {
        const lowerSearchText = String(searchText).toLowerCase();
        const lowerValue = String(value).toLowerCase();

        // 普通大小写忽略搜索
        if (lowerValue.includes(lowerSearchText)) {
            return true;
        }

        // 拼音搜索，支持全拼、首字母和混合拼音
        if (matchPinyin(String(value), String(searchText))) {
            return true;
        }
    } catch (e) {
        console.log(e)
    }

    return false;
};

// 多字段文本搜索：搜索词按空格拆分，每个词都需要命中任一字段
export const searchFields = (searchText: string, fields: Array<SearchField>): boolean => {
    const tokens = searchTokens(searchText)
    if (!tokens.length) return true

    const validFields = fields.filter(field => field !== null && field !== undefined && String(field))
    if (!validFields.length) return false

    return tokens.every(token => validFields.some(field => searchStr(token, field)))
}

// 获取密码强度
export const getPasswordStrength = (password: string): number => {
    if (!password) {
        return 0
    }
    let lvl = 0;
    // 数字
    if (/[0-9]/.test(password)) {
        lvl++;
    }
    // 小写字母
    if (/[a-z]/.test(password)) {
        lvl++;
    }
    // 大写字母
    if (/[A-Z]/.test(password)) {
        lvl++;
    }
    // 特殊符号
    if (/[^0-9a-zA-Z_]/.test(password)) {
        lvl++;
    }
    // 长度小于6位（长度小于6位不能作为强密码）
    if (password.length < 6 && lvl > 2) {
        lvl = 2;
    }
    return lvl > 3 ? 3 : lvl;
}


// 随机生成密码
export function randomPassword(generateRule: GenerateRule) {
    try {
        const setting = useSettingStore().setting
        const excluded = setting.passwordExclusions
            ? getExcludedCharacters(setting.passwordExclusions)
            : setting.easyConfuseChat
        return generatePassword(generateRule, excluded)
    } catch (e: any) {
        ElNotification.error({title: '生成失败', message: e?.message || '当前环境不支持安全随机数'})
        return ''
    }
}

// 获取密码标签
export const getPasswordLabelNames = (password: Password, labelArray?: Array<Label>): Array<Label> => {
    if (!password.labels) return []
    const recursionFindLabel = (labels: Array<Label>, results: Array<Label>) => {
        for (let i = 0; i < labels.length; i++) {
            if (password.labels.includes(labels[i].id)) {
                results.push(labels[i])
            }
            if (labels[i].children.length) {
                recursionFindLabel(labels[i].children, results);
            }
        }
    }
    const results: Array<Label> = []
    recursionFindLabel(labelArray || usePasswordStore().labelArray, results)
    return results;
}


// 分享密码
export const sharePassword = (password: Password) => {
    const lines = [password.title]
    getOrderedPasswordFields(password).forEach(orderedField => {
        if (orderedField.type === 'custom') {
            if (orderedField.field.key || orderedField.field.val) {
                lines.push(orderedField.field.key + ': ' + orderedField.field.val)
            }
            return
        }
        if (orderedField.key === 'labels') return
        if (orderedField.key === 'address' && password.address) {
            lines.push('地址: ' + password.address)
        } else if (orderedField.key === 'username' && password.username) {
            lines.push('用户名: ' + password.username)
        } else if (orderedField.key === 'password' && password.password) {
            lines.push('密码: ' + password.password)
        } else if (orderedField.key === 'remark' && password.remark) {
            lines.push(password.remark)
        }
    })

    const text = lines.join('\r\n')
    // 复制到剪切板
    copyText(text, true);
    ElMessage.success('已复制到剪切板');
}

// 根据密码强度返回颜色
export const getPasswordStrengthColor = (password: string): string => {
    let strength = getPasswordStrength(password)
    return [
        '',
        '#F56C6C',
        '#FF9700',
        '#67C23A'
    ][strength]
}

// 根据密码强度返回提示语
export const getPasswordStrengthTip = (password: string): string => {
    let strength = getPasswordStrength(password)
    return ['', '弱密码', '中等强度密码', '强密码'][strength]
}


// 格式化时间
export const formatterDate = (timestamp: number, format: string): string => {
    const date = new Date(timestamp);

    const pad = (n: number) => (n < 10 ? '0' + n : n);
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());

    return format
        .replace('YYYY', year.toString())
        .replace('MM', month.toString())
        .replace('DD', day.toString())
        .replace('HH', hours.toString())
        .replace('mm', minutes.toString())
        .replace('ss', seconds.toString());
}

export const parseDate = (dateString: string, format: string): Date => {
    const formatParts = format.split(/[^A-Za-z]/);
    const dateParts = dateString.split(/[^0-9]/);

    const dateMap: { [key: string]: number } = {};

    formatParts.forEach((part, i) => {
        dateMap[part] = parseInt(dateParts[i], 10);
    });

    const year = dateMap['YYYY'] || 1970;
    const month = (dateMap['MM'] || 1) - 1;
    const day = dateMap['DD'] || 1;
    const hours = dateMap['HH'] || 0;
    const minutes = dateMap['mm'] || 0;
    const seconds = dateMap['ss'] || 0;

    return new Date(year, month, day, hours, minutes, seconds);
}

// 合并密码
export const mergePassword = (existPasswordArray: Array<Password>, recoveryPasswordArray: Array<Password>) => {
    // 自增id（因为程序很快一毫秒能恢复很多）
    let incrId = Date.now()
    const usedIds = new Set([...existPasswordArray, ...recoveryPasswordArray].map(password => password.id))

    recoveryPasswordArray.forEach((recoveryPassword: Password) => {
        // 判断当前密码列表是否存在要还原的密码
        let index = existPasswordArray.findIndex((password: Password) => password.id === recoveryPassword.id)
        if (index === -1) {
            // 密码列表不存在当前密码直接添加
            existPasswordArray.push(recoveryPassword)
            return
        }
        // 此密码Id已存在，比较内容是否一致
        let existPassword = existPasswordArray[index]
        if (comparePassword(recoveryPassword, existPassword)) {
            // id已存在且内容相等，比较标签是否相等
            if (recoveryPassword.labels && recoveryPassword.labels.length > 0) {
                // 取标签交集合并
                const labelSet = new Set(existPassword.labels);
                const appendLabels = recoveryPassword.labels.filter(item => !labelSet.has(item));
                existPassword.labels.push(...appendLabels);
            }
            return;
        }

        // 密码id已存在且内容不一致
        recoveryPassword.remark += '（合并恢复 ' + formatterDate(Date.now(), 'YYYY-MM-DD HH:mm') + '）'
        while (usedIds.has(incrId)) incrId++
        recoveryPassword.id = incrId++
        usedIds.add(recoveryPassword.id)
        existPasswordArray.push(recoveryPassword)
    })
}

// 合并标签树，并返回旧 ID 到最终 ID 的映射。只修改目标树，不改变恢复来源。
export const mergeLabel = (existLabelArray: Array<Label>, recoveryArray: Array<Label>): Map<number, number> => {
    const usedIds = new Set<number>()
    const reserveIds = (labels: Label[]) => labels.forEach(label => {
        usedIds.add(label.id)
        reserveIds(label.children || [])
    })
    reserveIds(existLabelArray)
    // 新分配的 ID 也不能占用后面还未处理的恢复节点 ID。
    const reservedIds = new Set<number>()
    const reserveIncoming = (labels: Label[]) => labels.forEach(label => {
        reservedIds.add(label.id)
        reserveIncoming(label.children || [])
    })
    reserveIncoming(recoveryArray)
    let nextId = Date.now()
    const allocateId = () => {
        while (usedIds.has(nextId) || reservedIds.has(nextId)) nextId++
        return nextId++
    }
    const idMap = new Map<number, number>()
    const merge = (target: Label[], incoming: Label[], pid: number) => {
        for (const label of incoming) {
            let existing = target.find(item => item.id === label.id && item.name === label.name)
            if (!existing) {
                const id = usedIds.has(label.id) ? allocateId() : label.id
                existing = {...label, id, pid, children: []}
                target.push(existing)
                usedIds.add(id)
            }
            idMap.set(label.id, existing.id)
            merge(existing.children, label.children || [], existing.id)
        }
    }
    merge(existLabelArray, recoveryArray, 0)
    return idMap
}

// 统计标签总数
export const getLabelCount = (): number => {
    let count = 0;
    const countLabels = (labelArray: Array<Label>) => {
        labelArray.forEach((label) => {
            count++
            if (label.children && label.children.length > 0) {
                countLabels(label.children)
            }
        })
    }
    countLabels(usePasswordStore().labelArray)
    return count
}

// 根据ID获取标签名
export const getLabelNamesByIds = (ids: Array<number>): string => {
    let results: string = '';
    const labelByIds = (labelArray: Array<Label>, parent: string) => {
        labelArray.forEach((label) => {
            if (ids.includes(label.id)) {
                if (results) {
                    results += '、'
                }
                results += parent + '->' + label.name;
            }
            if (label.children && label.children.length > 0) {
                labelByIds(label.children, label.name);
            }
        })
    }
    labelByIds(usePasswordStore().labelArray, '')
    return results
}

// 根据标签名反解析标签
export const parseLabels = (tagString: string): Array<Label> => {

    const tags = tagString.split('、'); // 假设标签之间用中文顿号分隔
    const labelObjects: Array<Label> = [];

    tags.forEach(tag => {
        const levels = tag.split('->').map(level => level.trim()); // 假设层级用箭头分隔，去除空格
        let parent: Label | undefined = undefined;

        levels.forEach((name, index) => {
            // 查找当前层级的标签是否已存在
            let currentLabel: Label | undefined;

            if (index === 0) {
                // 处理顶级标签，查找是否已存在相同名称的顶级标签
                currentLabel = labelObjects.find(label => label.name === name && label.pid === 0);

                if (!currentLabel && name) {
                    // 如果不存在，创建新的顶级标签对象
                    currentLabel = {
                        id: incrId(), // 可根据实际情况生成唯一ID
                        name: name,
                        pid: 0, // 设置顶级标签的父级ID为0
                        children: [],
                    };
                    labelObjects.push(currentLabel); // 添加到顶级标签数组中
                }
            } else {
                // 处理子级标签，查找是否已存在相同名称的子级标签
                currentLabel = parent?.children.find(label => label.name === name);

                if (!currentLabel) {
                    // 如果不存在，创建新的子级标签对象
                    currentLabel = {
                        id: incrId(), // 可根据实际情况生成唯一ID
                        name: name,
                        pid: parent ? parent.id : 0, // 设置父级标签ID，顶级标签使用 0
                        children: [],
                    };
                    parent?.children.push(currentLabel); // 添加到父级的子标签数组中
                }
            }

            // 更新父级为当前标签，以便处理下一级
            parent = currentLabel;
        });
    });

    return labelObjects;
}

// 判断鼠标是否在指定位置
export const isInCircle = (x: number, y: number, radius: number, mouseX: number, mouseY: number): boolean => {
    // 计算鼠标与圆心之间的距离
    const distance = Math.sqrt((mouseX - x) * (mouseX - x) + (mouseY - y) * (mouseY - y));
    // 判断距离是否小于等于半径
    return distance <= radius;
}

// 比较内容时保留字段边界；自定义字段的 UI ID 不属于业务内容。
export const comparePassword = (a: Password, b: Password): boolean => {
    const content = (password: Password) => JSON.stringify([
        password.title, password.username, password.address, password.password, password.remark,
        (password.customFields || []).map(field => [field.key, field.val, !!field.hidden]),
    ])
    return content(a) === content(b)
}

// 获取当前域名地址
export const getLocationUrl = () => {
    let url = location.origin
    if (url.startsWith('file://')) {
        url += location.pathname
    }
    return url
}

// 获取背景颜色
export const getBgColor = (color: string, option: string) => {
    if (!color) {
        return ''
    }
    let resultColor = color.replace('rgb', 'rgba')
    resultColor = resultColor.replace(')', ',' + option + ')')
    return resultColor
}

let nowId = Date.now()
export const incrId = () => {
    return nowId++
}

export const getFastLoginLink = (loginForm: any): string => {
    let url = getLocationUrl()
    return url + '/login/' + loginForm.loginType + '?autoLogin=' + encryptAES('password-xl', JSON.stringify(loginForm));
}

export const generateRandomId = (): string => {
    const wordArray = CryptoJS.lib.WordArray.random(8);
    return wordArray.toString(CryptoJS.enc.Hex);
}

// 判断是否支持调用AI
export const supportAI = () => {
    // 一般在http访问时不支持加解密，https或本地访问时支持
    return !!window.crypto.subtle
}

// 判断当前元素是否可编辑
export const isEditableTarget = (target: EventTarget | null): boolean => {
    const el = target as HTMLElement | null;
    if (!el) return false;

    // 任何输入控件内都不抢
    const tag = el.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;

    // contenteditable（富文本）也不抢
    if (el.isContentEditable) return true;

    // 有些组件会把焦点放在内部元素（如 div role="textbox"）
    const role = el.getAttribute?.("role");
    return role === "textbox";
}
