export function stringifyWithBigInt(obj: unknown): string {
  return JSON.stringify(
    obj,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value), // return everything else unchanged
  );
}

export function _require(
  b: boolean,
  message: string,
  values?: Record<string, unknown>,
  condition?: string,
): void {
  if (!b) {
    let receivedValues = "";
    if (values && condition) {
      const keyValueStr = Object.entries(values)
        .map(([k, v]) => `${k}=${stringifyWithBigInt(v)}`)
        .join(", ");
      receivedValues = `Values: ${keyValueStr}. Condition: ${condition} violated. `;
    }
    throw new Error(
      `${receivedValues}Error message: ${message ? message : "undefined"}`,
    );
  }
}

export function _gt(x: bigint, y: bigint) {
  return x > y ? 1n : 0n;
}
