// 压缩数组
export const compressArray = (array) => {
    const keys = {};
    const dataArray = [];
    let keyIndex = 0;

    for (let j = 0; j < array.length; j++) {
        const itemArray = [];
        for (const key in array[j]) {
            if (!keys.hasOwnProperty(key)) {
                keys[key] = keyIndex++;
            }
            itemArray[keys[key]] = array[j][key];
        }
        dataArray.push(itemArray);
    }
    return { keys, dataArray };
};

// 解压数组
export const decompressionArray = (obj) => {
    const dataArray = [];
    for (let i = 0; i < obj.dataArray.length; i++) {
        const itemArray = obj.dataArray[i];
        const item = {};
        for (const key in obj.keys) {
            const value = itemArray[obj.keys[key]];
            if (value !== undefined) {
                item[key] = value;
            }
        }
        dataArray.push(item);
    }
    return dataArray;
};
