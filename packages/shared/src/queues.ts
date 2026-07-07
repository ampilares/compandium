// Queue names + payload contracts. Single source of truth for producers
// (apps/web) and consumers (apps/worker).

export const QUEUES = {
  provisionInstance: "provision-instance",
  connectorSync: "connector-sync",
  connectorScan: "connector-scan",
  healthPoll: "health-poll",
  meterUsage: "meter-usage",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface ProvisionInstancePayload {
  instanceId: string;
  organizationId: string;
}

export interface ConnectorSyncPayload {
  connectorId: string;
}

export interface MeterUsagePayload {
  /** ISO date (YYYY-MM-DD) to meter; defaults to yesterday when absent */
  day?: string;
}
