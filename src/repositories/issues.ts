import type { Sql } from 'postgres';

import { type IssueStatus, OBSERVABILITY_SCHEMA_NAME } from '../schema/index.js';

const ISSUES_TABLE = `"${OBSERVABILITY_SCHEMA_NAME}"."log_issues"`;

/** Devuelve true si el issue existía y fue actualizado, false si no existe. */
export async function updateIssueStatus(
  raw: Sql,
  id: string,
  status: IssueStatus
): Promise<boolean> {
  const rows = await raw.unsafe<{ id: string }[]>(
    `UPDATE ${ISSUES_TABLE} SET status = $1 WHERE id = $2::uuid RETURNING id`,
    [status, id]
  );
  return rows.length > 0;
}
