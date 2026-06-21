import {randomPassword} from "@/utils/global.js";
import {decryptAES, encryptAES, encryptRSA} from "@/utils/security.js";
import axios from "axios";
import config from "@/config";
import {useSettingStore} from "@/stores/SettingStore.ts";
import {AiProvider} from "@/types";
import {extractPasswordByModelApi} from "@/api/ai-model-api.ts";


const extractPasswordOfficialApi = async (text: string, batch: boolean = false) => {
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
        console.log("AI解析发送请求")
        axios.post(config.apiServer + '/extractPassword', body).then((res) => {
            let data: any = res.data
            if (data.code !== 200) {
                reject(data.message)
                return
            }

            let password = decryptAES(key, data.data)
            resolve(password)
        }).catch((err) => {
            console.log('提取密码失败', err)
            reject('提取密码失败')
        })
    })
}

export const extractPasswordApi = async (text: string, batch: boolean = false) => {
    console.log('AI解析密码')
    const settingStore = useSettingStore()
    if (settingStore.setting.aiModel?.provider && settingStore.setting.aiModel.provider !== AiProvider.OFFICIAL) {
        return extractPasswordByModelApi(text, batch)
    }
    return extractPasswordOfficialApi(text, batch)
}
