export function replacer(key: string, value: any): any {
  if (typeof value === "bigint") {
    return value.toString();
  } else if (value instanceof Map) {
    // Convert Map to a plain object
    const obj: { [key: string]: any } = {};
    value.forEach((v, k) => {
      obj[k.toString()] = v;
    });
    return obj;
  }
  return value;
}
export function reviver(key: string, value: any): any {
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return BigInt(value); // 将纯数字字符串替换成 bigint
  } else if (typeof value === "object") {
    // 递归调用 reviver 函数，处理嵌套的对象
    for (const k in value) {
      if (value.hasOwnProperty(k)) {
        value[k] = reviver(k, value[k]);
      }
    }
  }
  return value;
}
