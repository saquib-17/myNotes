import * as defaultWorkspaceRepo from './workspaceRepository.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves the active workspace ID for an authenticated request.
 * Prioritizes:
 *  1. req.query.workspaceId
 *  2. req.headers['x-workspace-id']
 *  3. req.body?.workspaceId
 *
 * If explicit ID provided: validates UUID format and confirms active ownership by req.user.id.
 * If omitted: resolves the user's active default workspace (creating one if none exists).
 *
 * @param {object} req - Express request
 * @param {object} [pool] - Database pool
 * @param {object} [workspaceRepo] - Workspace repository override
 * @returns {Promise<string|null>} Verified workspace ID
 */
export async function resolveWorkspaceId(
  req,
  pool,
  workspaceRepo = defaultWorkspaceRepo
) {
  if (req.workspaceId) {
    return req.workspaceId;
  }

  const userId = req.user?.id;
  if (!userId) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }

  const requestedId =
    req.query?.workspaceId ||
    req.headers?.['x-workspace-id'] ||
    req.body?.workspaceId;

  if (requestedId) {
    if (typeof requestedId !== 'string' || !UUID_REGEX.test(requestedId.trim())) {
      const err = new Error('Invalid workspace ID format.');
      err.status = 400;
      throw err;
    }

    const ws = await workspaceRepo.findWorkspaceByIdAndUserId(
      requestedId.trim(),
      userId,
      pool
    );
    if (!ws) {
      const err = new Error('Workspace not found or access denied.');
      err.status = 404;
      throw err;
    }

    req.workspaceId = ws.id;
    return ws.id;
  }

  // Fallback to active default workspace (ensuring one exists)
  try {
    let defaultWs = await workspaceRepo.findDefaultWorkspaceByUserId(userId, pool);
    if (!defaultWs) {
      defaultWs = await workspaceRepo.ensureDefaultWorkspaceForUser({ userId, pool });
    }
    const id = defaultWs?.id || null;
    req.workspaceId = id;
    return id;
  } catch {
    return null;
  }
}

