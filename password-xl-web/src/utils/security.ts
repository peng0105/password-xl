import CryptoJS from 'crypto-js'

// 获取浏览器指纹
export const browserFingerprint = (): string => {
    let param = ''
    try {
        param += (Intl.DateTimeFormat().resolvedOptions().timeZone || '') + ','
    } catch (e) {
    }
    try {
        param += (window.navigator.userAgent || '') + ','
        param += (window.navigator.language || '') + ','
        param += (window.navigator.hardwareConcurrency || '') + ','
        param += (window.screen.width || '') + ','
        param += (window.screen.height || '') + ','
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

// 检查密码是否正确
export const checkPassword = (key: string, content: string) => {
    try {
        return !!decryptAES(key, content)
    } catch (e) {
        return false
    }
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