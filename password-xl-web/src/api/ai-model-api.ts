import axios from "axios";
import {AiProvider, AiThinking} from "@/types";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {useSettingStore} from "@/stores/SettingStore.ts";
import {decryptAES} from "@/utils/security.ts";

export const singleExtractPrompt = `请帮我在用户文本中提取账户密码等信息，需要提取的字段如下：
\t名称：可能是各种平台、服务、网站的名称、有可能包含分类标签等
\t地址：可能是网站地址、ip地址、http(s)地址等
\t用户名：可能是邮箱、手机号、某些拼音单词等
\t密码：可能是无规律的随机字符
\t备注：除以上信息外的其他说明信息
请按照以下模板回复（未提取到的字段就空着）:
\t名称:
\t地址:
\t用户名:
\t密码:
\t备注:
无需总结，无需回复模板以外的任何其他内容`;

export const batchExtractPrompt = `请帮我在用户文本中提取所有账户密码等信息，需要提取的字段如下：
\t名称：可能是各种平台、服务、网站的名称、有可能包含分类标签等
\t地址：可能是网站地址、ip地址、http(s)地址等
\t用户名：可能是邮箱、手机号、某些拼音单词、编号等
\t密码：可能是无规律的随机字符、数字、特殊字符等
\t备注：除以上信息外的其他说明信息
文本中可能包含多个账户密码信息，请逐一提取并按照以下模板格式回复（每个账户信息之间用空行分隔，未提取到的字段就空着）:
\t名称:
\t地址:
\t用户名:
\t密码:
\t备注:
无需总结，无需回复模板以外的任何其他内容`;

interface ExtractedPassword {
    name?: string,
    address?: string,
    username?: string,
    password?: string,
    remark?: string,
}

const getPassword = (block: string): ExtractedPassword => {
    const lines = block.split(/\r?\n/);
    const password: ExtractedPassword = {};
    for (let line of lines) {
        line = line.replaceAll("：", ":").trim();
        if (line.startsWith("名称") && !password.name) {
            password.name = line.replace("名称:", "").trim();
        } else if (line.startsWith("地址") && !password.address) {
            password.address = line.replace("地址:", "").trim();
        } else if (line.startsWith("用户名") && !password.username) {
            password.username = line.replace("用户名:", "").trim();
        } else if (line.startsWith("密码") && !password.password) {
            password.password = line.replace("密码:", "").trim();
        } else if (line.startsWith("备注") && !password.remark) {
            password.remark = line.replace("备注:", "").trim();
        }
    }
    return password;
}

const isEmptyPassword = (password: ExtractedPassword): boolean => {
    return !password.name && !password.address && !password.username && !password.password && !password.remark;
}

const parseModelContent = (content: string, batch: boolean): string => {
    if (!batch) {
        return JSON.stringify(getPassword(content));
    }

    const passwordArray = content
        .split(/\r?\n\s*\r?\n/)
        .map(block => getPassword(block))
        .filter(password => !isEmptyPassword(password));
    return JSON.stringify(passwordArray);
}

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

export const extractPasswordByModelApi = async (text: string, batch: boolean = false): Promise<string> => {
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
                content: batch ? batchExtractPrompt : singleExtractPrompt,
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
        const content = res.data?.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('AI模型未返回有效内容');
        }
        return parseModelContent(content, batch);
    } catch (err: any) {
        console.log('第三方AI模型提取密码失败', err);
        throw new Error(getErrorMessage(err));
    }
}

export const testAiModelApi = async () => {
    return extractPasswordByModelApi('GitHub https://github.com test@example.com P@ssw0rd 备用账号', false);
}
