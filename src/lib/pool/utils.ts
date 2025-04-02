import { PoolType } from "src/common/types";
import { Pool, PoolInfo } from "./pool";
import { UniV3Pool } from "./univ3/pool";


class Utils {
  public createPoolFromJSON(
    str: string
  ): Pool | null {
    let initialInfo = JSON.parse(str) as PoolInfo;
    switch (initialInfo.poolType) {
      // case PoolType.V2_LIKE_PVOOL:
      //   return V2LikePool.createFromJSON(str);
      case PoolType.UNIV3:
        return UniV3Pool.createFromJSON(str);
      default:
        return null;
    }
  }
}

export const PoolUtils = new Utils();