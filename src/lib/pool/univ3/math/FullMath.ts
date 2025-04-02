import { BI_MAX_UINT256 } from "./constants";
import { _require } from "./utils";

export class FullMath {
  static mulDiv(a: bigint, b: bigint, denominator: bigint) {
    const result = (a * b) / denominator;

    _require(
      result <= BI_MAX_UINT256,
      "",
      { result, BI_MAX_UINT: BI_MAX_UINT256 },
      "result <= BI_MAX_UINT",
    );

    return result;
  }

  //   static mulDiv(a: bigint, b: bigint, denominator: bigint): bigint {
  //     // 512-bit multiply [prod1 prod0] = a * b
  //     const one = BigInt(1);
  //     const zero = BigInt(0);
  //     const two256 = one << BigInt(256); // 2^256

  //     // Compute the product mod 2**256 and mod 2**256 - 1
  //     const prod0 = a * b; // Least significant 256 bits of the product
  //     let prod1 = prod0 >> BigInt(256); // Most significant 256 bits of the product

  //     // Handle non-overflow cases, 256 by 256 division
  //     if (prod1 === zero) {
  //         if (denominator === zero) throw new Error("Denominator must be greater than 0");
  //         return prod0 / denominator;
  //     }

  //     // Ensure denominator > prod1
  //     if (denominator <= prod1) {
  //         throw new Error("Denominator must be greater than prod1");
  //     }

  //     // Compute remainder using mulmod (a * b) % denominator
  //     const remainder = (a * b) % denominator;

  //     // Subtract 256-bit number from 512-bit number
  //     prod1 = prod1 - (remainder > prod0 ? one : zero);
  //     const newProd0 = prod0 - remainder;

  //     // Factor powers of two out of denominator
  //     const twos = denominator & -denominator; // Largest power of two divisor
  //     denominator /= twos;

  //     // Divide [prod1 prod0] by the factors of two
  //     let finalProd0 = newProd0 / twos;

  //     // Shift bits from prod1 into prod0
  //     const flippedTwos = two256 / twos;
  //     finalProd0 = finalProd0 | (prod1 * flippedTwos);

  //     // Invert denominator mod 2^256
  //     let inv = (BigInt(3) * denominator) ^ BigInt(2);
  //     inv *= BigInt(2) - denominator * inv; // inverse mod 2**8
  //     inv *= BigInt(2) - denominator * inv; // inverse mod 2**16
  //     inv *= BigInt(2) - denominator * inv; // inverse mod 2**32
  //     inv *= BigInt(2) - denominator * inv; // inverse mod 2**64
  //     inv *= BigInt(2) - denominator * inv; // inverse mod 2**128
  //     inv *= BigInt(2) - denominator * inv; // inverse mod 2**256

  //     // Final result by multiplying with the modular inverse of denominator
  //     return finalProd0 * inv;
  // }

  static mulDivRoundingUp(a: bigint, b: bigint, denominator: bigint) {
    // const result = (a * b + denominator - 1n) / denominator;
    let result = this.mulDiv(a, b, denominator);
    if ((a * b) % denominator > 0n) {
      result += 1n;
    }

    _require(
      result <= BI_MAX_UINT256,
      "",
      { result, BI_MAX_UINT: BI_MAX_UINT256 },
      "result <= BI_MAX_UINT",
    );

    return result;
  }
}
