import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "../components/layout/app-shell";
import { ConnectionsPage } from "../features/connections/pages/connections-page";
import { DatasetsPage } from "../features/datasets/pages/datasets-page";
import { HistoryPage } from "../features/history/pages/history-page";
import { LogsPage } from "../features/logs/pages/logs-page";
import { SettingsPage } from "../features/settings/pages/settings-page";
import { WorkspacePage } from "../features/workspace/pages/workspace-page";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/workspace" replace /> },
      { path: "workspace", element: <WorkspacePage /> },
      { path: "datasets", element: <DatasetsPage /> },
      { path: "connections", element: <ConnectionsPage /> },
      { path: "history", element: <HistoryPage /> },
      { path: "logs", element: <LogsPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);

