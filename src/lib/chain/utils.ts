import { FACTORY_MAP } from '../../common/constants';

// 获取协议类型
export function getProtocolType(factory: string): string {
  // 首先尝试从factory地址推导
  const protocolFromFactory = FACTORY_MAP[factory.toLowerCase()];
  if (protocolFromFactory) {
    return protocolFromFactory;
  }
  return 'Unknown';
} 