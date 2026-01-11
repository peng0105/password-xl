import {ElMessage} from "element-plus";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {GenerateRule, Label, Password} from "@/types";
import {useSettingStore} from "@/stores/SettingStore.ts";
import {encryptAES} from "@/utils/security.ts";
import CryptoJS from 'crypto-js'

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

// 文本搜索
export const searchStr = (searchText: string, value: string): boolean => {
    if (!value) return false;
    if (!searchText) return false;

    try {
        const lowerSearchText = searchText.toLowerCase();
        const lowerValue = value.toLowerCase();

        // 普通大小写忽略搜索
        if (lowerValue.includes(lowerSearchText)) {
            return true;
        }
    } catch (e) {
        console.log(e)
    }

    return false;
};

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


// 密码字典
export const passwordDist = {
    uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    lowercase: "abcdefghijklmnopqrstuvwxyz",
    number: "0123456789",
    symbol: "~!@#$%^&*()_-+=.,;",
}

// 随机生成密码
export function randomPassword(generateRule: GenerateRule) {
    let pool = [
        generateRule.uppercase ? passwordDist.uppercase : '',
        generateRule.lowercase ? passwordDist.lowercase : '',
        generateRule.number ? passwordDist.number : '',
        generateRule.symbol ? passwordDist.symbol : ''
    ].filter(Boolean);

    const settingStore = useSettingStore()
    // 是否禁用易混淆字符
    if (settingStore.setting.easyConfuseChat) {
        const array = settingStore.setting.easyConfuseChat.split('');
        for (let i = 0; i < pool.length; i++) {
            for (let j = 0; j < array.length; j++) {
                pool[i] = pool[i].replace(array[j], '');
            }
        }
    }

    pool = pool.filter(Boolean)
    if (!pool.length) {
        ElNotification.error({title: '生成失败', message: '请检查易混淆字符配置'})
        return ''
    }

    // 随机生成密码
    let password = '';
    for (let i = 0; i < generateRule.length; i++) {
        const subPool = pool[i % pool.length];
        const randomIndex = Math.floor(Math.random() * subPool.length);
        password += subPool[randomIndex];
    }

    // 打乱顺序
    return password.split('').sort(() => Math.random() - 0.5).join('');
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
    let text = password.title + '\r\n'
    if (password.address) {
        text += '地址: ' + password.address + '\r\n'
    }
    if (password.username) {
        text += '用户名: ' + password.username + '\r\n'
    }
    if (password.password) {
        text += '密码: ' + password.password + '\r\n'
    }
    // 自定义字段
    if (password.customFields) {
        for (let i = 0; i < password.customFields.length; i++) {
            let field = password.customFields[i];
            text += field.key + ': ' + field.val + '\r\n'
        }
    }
    if (password.remark) {
        text += password.remark + '\r\n'
    }

    text = text.substring(0, text.length - 2)
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
                existPassword.labels = recoveryPassword.labels.filter(item => !labelSet.has(item));
            }
            return;
        }

        // 密码id已存在且内容不一致
        recoveryPassword.remark += '（合并恢复 ' + formatterDate(Date.now(), 'YYYY-MM-DD HH:mm') + '）'
        recoveryPassword.id = incrId++
        existPasswordArray.push(recoveryPassword)
    })
}

// 合并标签树
export const mergeLabel = (existLabelArray: Array<Label>, recoveryArray: Array<Label>) => {
    let incrId = Date.now() // 使用当前时间戳初始化增量ID

    // 递归查找标签树中是否存在指定ID的标签
    const findLabelId = (labelArray: Array<Label>, id: number): boolean => {
        for (const label of labelArray) {
            if (label.id === id) {
                return true;
            } else if (label.children && label.children.length > 0) {
                return findLabelId(label.children, id) // 递归查找子标签
            }
        }
        return false;
    }

    // 在标签树中查找与恢复标签相同的标签
    const findLabel = (labelArray: Array<Label>, recoveryLabel: Label): Label | undefined => {
        for (const label of labelArray) {
            if (label.id === recoveryLabel.id && label.name === recoveryLabel.name && label.pid === recoveryLabel.pid) {
                return label;
            }
        }
        return undefined;
    }

    // 添加或合并标签
    const addOrMergeLabel = (labelArray: Array<Label>, recoveryLabel: Label) => {
        const existingLabel = findLabel(labelArray, recoveryLabel);
        if (!existingLabel) {
            // 判断标签ID是否已经存在，不允许重复的ID
            if (findLabelId(existLabelArray, recoveryLabel.id)) {
                recoveryLabel.id = incrId++ // 如果ID重复，分配新的ID
            }
            labelArray.push(recoveryLabel); // 添加新的标签
        } else {
            for (const child of recoveryLabel.children) {
                addOrMergeLabel(existingLabel.children, child); // 递归合并子标签
            }
        }
    };

    // 遍历恢复标签数组，逐个合并
    for (const label of recoveryArray) {
        addOrMergeLabel(existLabelArray, label);
    }
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

const joinPassword = (password: Password) => {
    return password.title + password.username + password.address + password.password + password.remark
}

// 比较密码
export const comparePassword = (a: Password, b: Password): boolean => {
    return joinPassword(a) === joinPassword(b)
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
    return url + '/#/login?type=' + loginForm.loginType + '&autoLogin=' + encryptAES('password-xl', JSON.stringify(loginForm));
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