import * as si from 'systeminformation';
import type { AgentEvent, SystemStats } from '../../../src/lib/socket/types.js';

export async function handleGetSystemStats(requestId: string): Promise<AgentEvent> {
  try {
    const [cpu, cpuLoad, mem, disk, osInfo, timeData] = await Promise.all([
      si.cpu(),
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.osInfo(),
      si.time(),
    ]);

    // Use first disk (root)
    const rootDisk = disk[0] || { size: 0, used: 0, available: 0, use: 0 };

    const stats: SystemStats = {
      cpu: {
        usage: Math.round(cpuLoad.currentLoad * 100) / 100,
        cores: cpu.cores,
        model: `${cpu.manufacturer} ${cpu.brand}`,
      },
      memory: {
        total: mem.total,
        used: mem.used,
        free: mem.free,
        usagePercent: Math.round((mem.used / mem.total) * 10000) / 100,
      },
      disk: {
        total: rootDisk.size,
        used: rootDisk.used,
        free: rootDisk.available,
        usagePercent: rootDisk.use,
      },
      uptime: timeData.uptime,
      hostname: osInfo.hostname,
      platform: osInfo.platform,
    };

    return { type: 'SYSTEM_STATS', data: stats };
  } catch (error) {
    return {
      type: 'COMMAND_ERROR',
      requestId,
      message: `Failed to get system stats: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
