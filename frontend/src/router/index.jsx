import { createBrowserRouter, Navigate } from "react-router-dom";

import { AppLayout } from "../components/common/AppLayout.jsx";
import { RequireAuth } from "../components/common/RequireAuth.jsx";
import { ApiAnnotationsPage } from "../pages/ApiAnnotationsPage.jsx";
import { ApplicationPage } from "../pages/ApplicationPage.jsx";
import { ApplicationsPage } from "../pages/ApplicationsPage.jsx";
import { CreateApplicationPage } from "../pages/CreateApplicationPage.jsx";
import { GraphPage } from "../pages/GraphPage.jsx";
import { InstructionsPage } from "../pages/InstructionsPage.jsx";
import { KnowledgeBasePage } from "../pages/KnowledgeBasePage.jsx";
import { LoginPage } from "../pages/LoginPage.jsx";
import { ProcessingPage } from "../pages/ProcessingPage.jsx";
import { QueryPage } from "../pages/QueryPage.jsx";
import { RegisterPage } from "../pages/RegisterPage.jsx";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/applications" replace /> },
      { path: "instructions", element: <InstructionsPage /> },
      { path: "applications", element: <ApplicationsPage /> },
      { path: "applications/new", element: <CreateApplicationPage /> },
      { path: "applications/:id", element: <ApplicationPage /> },
      { path: "applications/:id/processing", element: <ProcessingPage /> },
      { path: "applications/:id/knowledge-base", element: <KnowledgeBasePage /> },
      { path: "applications/:id/knowledge-base/graph", element: <GraphPage /> },
      { path: "applications/:id/query", element: <QueryPage /> },
      { path: "applications/:id/api-annotations", element: <ApiAnnotationsPage /> },
    ],
  },
]);
