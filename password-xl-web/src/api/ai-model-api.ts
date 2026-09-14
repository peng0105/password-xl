import axios from "axios";
import {AiProvider, AiThinking} from "@/types";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {useSettingStore} from "@/stores/SettingStore.ts";
import {decryptAES} from "@/utils/security.ts";
import {batchExtractPrompt, parseAiCompletion} from '@/utils/aiPasswordExtraction.ts';
import type {ExtractedPassword} from '@/utils/aiPasswordExtraction.ts';

const getApiKey = (): string => {
    const settingStore = useSettingStore();
    const passwordStore = usePasswordStore();
    const apiKey = settingStore.setting.aiModel.apiKey;
    if (!apiKey) {
        throw new Error('请先在设置中配置AI模型API Key');
    }
    if (!passwordStore.mainPassword) {
        throw new Error('请先解锁密码本后再使用第三方AI模型');
    }
    const plainApiKey = decryptAES(passwordStore.mainPassword, apiKey);
    if (!plainApiKey) {
        throw new Error('AI模型API Key解密失败，请重新保存配置');
    }
    return plainApiKey;
}

const normalizeBaseUrl = (baseUrl: string): string => {
    return (baseUrl || '').replace(/\/+$/, '');
}

const getErrorMessage = (err: any): string => {
    const data = err?.response?.data;
    if (typeof data === 'string') {
        return data;
    }
    return data?.error?.message || data?.message || err?.message || '提取密码失败';
}

export const extractPasswordByModelApi = async (text: string): Promise<ExtractedPassword[]> => {
    const settingStore = useSettingStore();
    const aiModel = settingStore.setting.aiModel;
    const apiKey = getApiKey();
    const baseUrl = normalizeBaseUrl(aiModel.apiBaseUrl);
    if (!baseUrl) {
        throw new Error('请先配置AI模型接口地址');
    }
    if (!aiModel.model) {
        throw new Error('请先配置AI模型名称');
    }

    const body: any = {
        model: aiModel.model,
        stream: false,
        max_tokens: 4096,
        temperature: 0,
        messages: [
            {
                role: 'system',
                content: batchExtractPrompt,
            },
            {
                role: 'user',
                content: text,
            }
        ],
    };

    if (aiModel.provider === AiProvider.DEEPSEEK) {
        body.thinking = {
            type: aiModel.thinking || AiThinking.DISABLED,
        };
    }

    try {
        const res = await axios.post(baseUrl + '/chat/completions', body, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            }
        });
        return parseAiCompletion(res.data?.choices?.[0]);
    } catch (err: any) {
        throw new Error(getErrorMessage(err));
    }
}

export const testAiModelApi = async () => {
    const passwords = await extractPasswordByModelApi('GitHub https://github.com test@example.com P@ssw0rd 备用账号');
    if (!passwords.length) throw new Error('未识别到密码信息');
    return passwords;
}
