import CryptoJS from 'crypto-js'

// 获取浏览器指纹
export const browserFingerprint = (): string => {
    let param = ''
    try {
        param += (Intl.DateTimeFormat().resolvedOptions().timeZone || '') + ','
    } catch (e) {
    }
    try {
        param += (window.navigator.languages.join(',') || '') + ','
        param += (window.navigator.hardwareConcurrency || '') + ','
    } catch (e) {
    }
    try {
        param += (window.getComputedStyle(document.documentElement).fontFamily || '') + ','
    } catch (e) {
    }
    try {
        let gl: WebGL2RenderingContext | null = document.createElement('canvas').getContext("webgl2");
        if (gl) {
            let debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
            if (debugInfo) {
                param += (gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '') + ','
            }
        }
    } catch (e) {
    }
    return CryptoJS.MD5(param).toString();
}

// 检查密码是否正确
export const checkPassword = (key: string, content: string) => {
    try {
        return !!decryptAES(key, content)
    } catch (e) {
        return false
    }
}

/**
 * 读取公钥
 */
async function importPublicKey(pem: string): Promise<CryptoKey> {
    // 解析PEM格式，提取Base64编码的密钥内容
    const pemHeader = "-----BEGIN PUBLIC KEY-----";
    const pemFooter = "-----END PUBLIC KEY-----";
    const pemContents = pem.replace(pemHeader, "").replace(pemFooter, "").replace(/\s+/g, "");

    // Base64解码
    const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

    // 导入公钥
    return crypto.subtle.importKey(
        "spki",
        binaryDer.buffer,
        {
            name: "RSA-OAEP",
            hash: "SHA-256",
        },
        true,
        ["encrypt"]
    );
}

/**
 * RSA 公钥加密
 * @param publicKeyPem
 * @param data
 */
export async function encryptRSA(publicKeyPem: string, data: string): Promise<string> {
    // 读取公钥
    const publicKey = await importPublicKey(publicKeyPem);
    // 给数据编码
    const encodedData = new TextEncoder().encode(data);
    // 使用公钥加密
    let encryptedBuffer = await crypto.subtle.encrypt(
        {name: "RSA-OAEP"},
        publicKey,
        encodedData
    )

    // 将密文编码成 Base64
    function arrayBufferToBase64(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    return arrayBufferToBase64(encryptedBuffer)
}


/* AES 加密 */
export const encryptAES = (key: string, content: string) => {
    const dataHex = CryptoJS.enc.Utf8.parse(content); // 需要加密的数据
    const keyHex = CryptoJS.enc.Utf8.parse(CryptoJS.MD5(key).toString()); // 秘钥
    const ivHex = CryptoJS.enc.Utf8.parse(CryptoJS.MD5('password-xl').toString()); // 偏移量
    const encrypted = CryptoJS.AES.encrypt(dataHex, keyHex, {
        iv: ivHex, mode: CryptoJS.mode.CBC, // 加密模式
        padding: CryptoJS.pad.Pkcs7,
    });
    return encrypted.ciphertext.toString();
}

/* AES 解密 */
export const decryptAES = (key: string, content: string) => {
    let encryptedHexStr = CryptoJS.enc.Hex.parse(content);
    let src = CryptoJS.enc.Base64.stringify(encryptedHexStr);
    const keyHex = CryptoJS.enc.Utf8.parse(CryptoJS.MD5(key).toString()); // 秘钥
    const ivHex = CryptoJS.enc.Utf8.parse(CryptoJS.MD5('password-xl').toString());
    let decrypt = CryptoJS.AES.decrypt(src, keyHex, {
        iv: ivHex, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7,
    });
    let decryptedStr = decrypt.toString(CryptoJS.enc.Utf8);
    return decryptedStr.toString();
}

/* MD5 */
export const md5 = (content: string): string => {
    return CryptoJS.MD5(content).toString()
}