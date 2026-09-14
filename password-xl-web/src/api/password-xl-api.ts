import {randomPassword} from "@/utils/global.ts";
import {decryptAES, encryptAES, encryptRSA} from "@/utils/security.ts";
import axios from "axios";
import config from "@/config";
import {useSettingStore} from "@/stores/SettingStore.ts";
import {AiProvider} from "@/types";
import {extractPasswordByModelApi} from "@/api/ai-model-api.ts";
import {parseExtractedPasswords} from '@/utils/aiPasswordExtraction.ts';
import type {ExtractedPassword} from '@/utils/aiPasswordExtraction.ts';


const extractPasswordOfficialApi = async (text: string): Promise<ExtractedPassword[]> => {
    // 随机一个密码作为服务端对称加密的密钥
    const key = randomPassword({length: 16, number: true, lowercase: true, uppercase: true, symbol: false})
    const encryptKey = await encryptRSA(config.publicKey, key)
    const body = {
        encryptKey,
        data: encryptAES(key, JSON.stringify({text})),
        // 沿用旧服务已有的批量协议；旧Web的false/缺省请求仍返回对象。
        batch: true,
    }
    const res = await axios.post(config.apiServer + '/extractPassword', body).catch(() => {
        throw new Error('提取密码失败')
    })
    if (res.data.code !== 200) throw new Error(res.data.message || '提取密码失败')
    return parseExtractedPasswords(decryptAES(key, res.data.data))
}

export const extractPasswordApi = async (text: string): Promise<ExtractedPassword[]> => {
    const settingStore = useSettingStore()
    if (settingStore.setting.aiModel?.provider && settingStore.setting.aiModel.provider !== AiProvider.OFFICIAL) {
        return extractPasswordByModelApi(text)
    }
    return extractPasswordOfficialApi(text)
}
