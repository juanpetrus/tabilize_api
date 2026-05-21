/** Nome da fila de sincronização de CNDs. */
export const CND_SYNC_QUEUE = 'cnd-sync';

/** Nome do job de sync de uma certidão. */
export const CND_SYNC_JOB = 'sync-cnd';

/** Payload do job. */
export interface CndSyncJobData {
  teamId: string;
  companyId: string;
  userId: string;
  type: string; // CndType
}
