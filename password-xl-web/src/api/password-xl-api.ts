import {randomPassword} from "@/utils/global.js";
import {decryptAES, encryptAES, encryptRSA} from "@/utils/security.js";
import axios from "axios";
import config from "@/config";
import {useSettingStore} from "@/stores/SettingStore.ts";

const requestOfficialAiApi = async (text: string, batch: boolean = false) => {
    // 随机一个密码作为服务端对称加密的密钥
    let key = randomPassword({length: 16, number: true, lowercase: true, uppercase: true, symbol: false})

    return new Promise(async (resolve, reject) => {
        let encryptKey = await encryptRSA(config.publicKey, key)

        let data = JSON.stringify({
            text: text,
        })

        // 使用AES加密请求报文
        let encryptData = encryptAES(key, data)

        let body = {
            encryptKey: encryptKey,
            data: encryptData,
            batch: batch,
        }
        axios.post(config.apiServer + '/extractPassword', body).then((res) => {
            let data: any = res.data
            if (data.code !== 200) {
                reject(data.message)
                return
            }

            let password = decryptAES(key, data.data)
            resolve(password)
        }).catch(() => {
            reject('提取密码失败')
        })
    })
}

const requestThirdPartyAiApi = async (text: string, batch: boolean = false) => {
    const settingStore = useSettingStore()
    const aiModel = settingStore.setting.aiModel

    if (!aiModel.baseUrl || !aiModel.apiKey || !aiModel.model) {
        return Promise.reject('请先在设置中完善AI模型配置')
    }

    const prompt = batch
        ? `请从以下文本中提取所有密码信息，并严格返回JSON数组字符串。每一项格式为：{"name":"","address":"","username":"","password":"","remark":""}。\n如果某字段不存在请填空字符串，不要返回markdown代码块，不要附加解释。\n文本内容：\n${text}`
        : `请从以下文本中提取1条密码信息，并严格返回JSON对象字符串，格式为：{"name":"","address":"","username":"","password":"","remark":""}。\n如果某字段不存在请填空字符串，不要返回markdown代码块，不要附加解释。\n文本内容：\n${text}`

    const baseUrl = aiModel.baseUrl.endsWith('/') ? aiModel.baseUrl.slice(0, -1) : aiModel.baseUrl
    const response = await axios.post(`${baseUrl}/chat/completions`, {
        model: aiModel.model,
        messages: [
            {
                role: 'user',
                content: prompt,
            }
        ],
        temperature: 0,
    }, {
        headers: {
            Authorization: `Bearer ${aiModel.apiKey}`,
            'Content-Type': 'application/json',
        }
    })

    const content = response?.data?.choices?.[0]?.message?.content
    if (!content) {
        return Promise.reject('AI模型返回内容为空')
    }

    return content.trim()
}

export const extractPasswordApi = async (text: string, batch: boolean = false) => {
    console.log('AI解析密码')
    const settingStore = useSettingStore()
    const provider = settingStore.setting.aiModel.provider

    if (provider === 'official') {
        return requestOfficialAiApi(text, batch)
    }

    return requestThirdPartyAiApi(text, batch).catch(() => {
        return Promise.reject('提取密码失败，请检查AI模型配置')
    })
}
