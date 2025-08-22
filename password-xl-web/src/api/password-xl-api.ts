import {randomPassword} from "@/utils/global.js";
import {decryptAES, encryptAES, encryptRSA} from "@/utils/security.js";
import axios from "axios";
import config from "@/config";


export const extractPasswordApi = async (text: string) => {
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
            data: encryptData
        }

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