// Queue names + payload contracts shared by producers (web) and consumers (worker).
// Keep in sync with apps/web when enqueueing.

export const QUEUES = {
  provisionInstance: "provision-instance",
  connectorSync: "connector-sync",
  healthPoll: "health-poll",
  meterUsage: "meter-usage",
} as const;

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
