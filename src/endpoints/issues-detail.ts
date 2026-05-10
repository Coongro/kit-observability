import type { HttpEndpointContext } from '@coongro/module-core';

import { badRequest, notFound } from '../http/response.js';
import { getIssueDetailService } from '../services/issues.service.js';

/**
 * GET /plugins/kit-observability/logs/issues/detail?fingerprint=<fp>
 *
 * Devuelve el detalle completo de un issue: row de log_issues enriquecido +
 * último log_entry sample (para stack trace + meta JSON) + lista de tenants
 * afectados + últimos eventos del mismo fingerprint.
 *
 * 404 si el fingerprint no existe en log_issues. La aggregación se hace por
 * fingerprint (no por id) porque el frontend trabaja con fingerprint como
 * "Issue.id efectivo" — ese identificador es estable entre reinicios y
 * único por error.
 */
export async function getIssueDetailEndpoint(context: HttpEndpointContext): Promise<unknown> {
  const fp = context.query['fingerprint'];
  if (typeof fp !== 'string' || fp.trim().length === 0) {
    return badRequest('fingerprint query parameter is required');
  }

  const detail = await getIssueDetailService(fp.trim());
  if (!detail.issue) return notFound(`Issue with fingerprint ${fp} not found`);

  return detail;
}
