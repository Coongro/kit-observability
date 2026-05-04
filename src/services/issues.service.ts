import { updateIssueStatus } from '../repositories/issues.js';
import { getRuntimeState } from '../runtime/state.js';
import { ISSUE_STATUS, type IssueStatus } from '../schema/index.js';

export { ISSUE_STATUS, type IssueStatus };

export interface IssueActor {
  tenantId?: string;
  actorId?: string;
}

export async function patchIssueStatus(
  id: string,
  status: IssueStatus,
  actor: IssueActor = {}
): Promise<{ found: boolean }> {
  const { systemDb, auditLog } = getRuntimeState();
  const found = await updateIssueStatus(systemDb.raw, id, status);

  if (found) {
    auditLog.record({
      action: 'issue.status_updated',
      tenantId: actor.tenantId ?? null,
      actorId: actor.actorId ?? null,
      entityType: 'log_issue',
      entityId: id,
      metadata: { status },
    });
  }

  return { found };
}

export function isValidStatus(value: unknown): value is IssueStatus {
  return typeof value === 'string' && Object.values(ISSUE_STATUS).includes(value as IssueStatus);
}
