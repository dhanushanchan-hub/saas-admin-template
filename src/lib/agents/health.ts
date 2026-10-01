// Builds the monitoring snapshot for the master junction: every connector's
// status plus live metrics from the database. Pure config + one batch of D1
// reads, so it's fast and safe to poll.

import { MissionService } from "../services/mission";
import { CloudRunService } from "../services/cloud";
import { ActivityService } from "../services/activity";
import {
  allConnectorGroups,
  isActive,
  STATUS_LABEL,
  type ConnectorStatus,
} from "./connectors";
import type { AgentTeamEnv } from "./types";

export type ConnectorView = {
  id: string;
  name: string;
  detail: string;
  status: ConnectorStatus;
  label: string;
  active: boolean;
  href: string;
  external: boolean;
};

export type GroupView = {
  id: string;
  title: string;
  description: string;
  active: number;
  total: number;
  connectors: ConnectorView[];
};

export type StatusSnapshot = {
  generated_at: string;
  summary: { active: number; total: number; groups: number };
  metrics: {
    missions_in_flight: number;
    briefs_24h: number;
    cloud_runs: number;
    last_activity: string | null;
  };
  groups: GroupView[];
};

export const buildStatusSnapshot = async (
  env: AgentTeamEnv,
  origin: string,
): Promise<StatusSnapshot> => {
  const [stats, cloudRuns, activity] = await Promise.all([
    new MissionService(env.DB).getStats(),
    new CloudRunService(env.DB).getAll({ limit: 200 }),
    new ActivityService(env.DB).getRecent(1),
  ]);

  const groups: GroupView[] = allConnectorGroups(env, origin).map((group) => {
    const connectors: ConnectorView[] = group.connectors.map((connector) => ({
      id: connector.id,
      name: connector.name,
      detail: connector.detail,
      status: connector.status,
      label: STATUS_LABEL[connector.status],
      active: isActive(connector.status),
      href: connector.href,
      external: connector.external ?? false,
    }));
    return {
      id: group.id,
      title: group.title,
      description: group.description,
      active: connectors.filter((c) => c.active).length,
      total: connectors.length,
      connectors,
    };
  });

  const active = groups.reduce((sum, g) => sum + g.active, 0);
  const total = groups.reduce((sum, g) => sum + g.total, 0);

  return {
    generated_at: new Date().toISOString(),
    summary: { active, total, groups: groups.length },
    metrics: {
      missions_in_flight: stats.in_flight,
      briefs_24h: stats.completed_24h,
      cloud_runs: cloudRuns.length,
      last_activity: activity[0]?.created_at ?? null,
    },
    groups,
  };
};
