import { useContext } from "react";
import { WorkspaceContext } from "./workspaceContextDef.js";

const DEFAULT_WORKSPACE_VALUE = {
  workspaces: [],
  activeWorkspaceId: null,
  activeWorkspace: null,
  isLoading: false,
  error: null,
  switchWorkspace: () => {},
  createNewWorkspace: async () => {},
  renameWorkspace: async () => {},
  removeWorkspace: async () => {},
  setAsDefault: async () => {},
  refreshWorkspaces: async () => {},
};

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  return context || DEFAULT_WORKSPACE_VALUE;
}

