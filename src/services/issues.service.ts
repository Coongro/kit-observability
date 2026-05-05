import {
  getIssueDetail as repoGetIssueDetail,
  queryIssues as repoQueryIssues,
  updateIssueStatus,
  type IssueDetail,
  type IssueQueryFilters,
  type IssueQueryResult,
} from '../repositories/issues.js';
import { getRuntimeState } from '../runtime/state.js';
import { ISSUE_STATUS, type IssueStatus } from '../schema/index.js';

export {
  ISSUE_STATUS,
  type IssueStatus,
  type IssueDetail,
  type IssueQueryFilters,
  type IssueQueryResult,
};

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

export async function queryIssuesService(filters: IssueQueryFilters): Promise<IssueQueryResult> {
  const { systemDb } = getRuntimeState();
  return repoQueryIssues(systemDb.raw, filters);
}

export async function getIssueDetailService(fingerprint: string): Promise<IssueDetail> {
  const { systemDb } = getRuntimeState();
  return repoGetIssueDetail(systemDb.raw, fingerprint);
}
