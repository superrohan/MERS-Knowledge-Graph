# UI, Node.js Backend, GitLab Integration and Application Workflow

## 1. Important Architecture Update

The system must have a React.js frontend and Node.js backend as the primary application layer.

The Python service remains responsible for code intelligence, parsing, knowledge graph construction, vector retrieval, and GraphRAG.

The architecture should therefore be:

```text
                         ┌─────────────────────┐
                         │      React.js       │
                         │      Frontend       │
                         └──────────┬──────────┘
                                    │
                                    │ HTTPS / REST
                                    ▼
                         ┌─────────────────────┐
                         │      Node.js        │
                         │    Application API  │
                         │                     │
                         │ Auth                │
                         │ Application         │
                         │ GitLab integration  │
                         │ Job management      │
                         │ API orchestration   │
                         └──────────┬──────────┘
                                    │
                                    │ Internal API
                                    ▼
                         ┌─────────────────────┐
                         │   Python Service    │
                         │                     │
                         │ Code ingestion      │
                         │ Tree-sitter         │
                         │ Graph construction  │
                         │ Embeddings          │
                         │ GraphRAG            │
                         │ Query engine        │
                         └──────────┬──────────┘
                                    │
                      ┌─────────────┴──────────────┐
                      ▼                            ▼
             InMemoryGraphStore          InMemoryVectorStore
```

The React application must never directly communicate with the Python service.

The React application communicates only with the Node.js backend.

The Node.js backend communicates with the Python code-intelligence service.

---

# 2. Responsibilities of Each Layer

## React.js

React is responsible for:

- Application creation
- Application list
- Application details
- AA/application number input
- GitLab repository URL input
- GitLab branch selection
- Indexing status
- Processing progress
- Processing logs/status
- Knowledge graph statistics
- Query interface
- Query history
- Answer display
- Source-code citations
- Graph visualization
- Error states
- Loading states

React should contain no knowledge of:

- Tree-sitter
- GraphStore
- VectorStore
- Embedding providers
- Neo4j
- Qdrant
- Python AST
- GitLab access tokens

---

# 3. Node.js Backend

Use:

```text
Node.js
TypeScript
Express.js or Fastify
```

Prefer TypeScript.

The Node.js backend is the application orchestration layer.

It should be responsible for:

- Application management
- Request validation
- GitLab integration
- Repository metadata
- Job creation
- Job status
- Calling the Python service
- Query orchestration
- API authentication/authorization hooks
- Audit logging
- Request IDs
- Error handling

The Node.js backend must not implement code parsing itself.

It should delegate code intelligence to Python.

---

# 4. Python Code Intelligence Service

The Python service should continue to implement everything defined in the original requirements:

```text
RepositoryScanner
Tree-sitter Python parser
Language-neutral IR
Graph builder
InMemoryGraphStore
InMemoryVectorStore
EmbeddingProvider
QueryEngine
GraphRetriever
VectorRetriever
HybridRetriever
EvidenceBuilder
LLMProvider
```

The Python service exposes internal APIs to the Node.js service.

Example:

```text
POST /internal/index
POST /internal/query
GET  /internal/index/{job_id}
GET  /internal/repository/{repository_id}/stats
```

The Python service should not expose these endpoints directly to the public internet.

---

# 5. Application Concept

The primary object in the application is an `Application`.

An application represents one codebase/repository that has been indexed.

Example:

```json
{
  "id": "app_123",
  "aaNumber": "AA-12345",
  "name": "Payment Platform",
  "repositoryUrl": "https://gitlab.example.com/team/payment-platform",
  "branch": "main",
  "status": "READY"
}
```

Do not expose internal database implementation details to the frontend.

---

# 6. Application Creation Workflow

The primary user workflow is:

```text
User opens application
        │
        ▼
Create Application
        │
        ├── AA/Application Number
        │
        ├── Application Name
        │
        ├── GitLab Repository URL
        │
        └── Branch
        │
        ▼
Validate
        │
        ▼
Create Application
        │
        ▼
Start Repository Processing
        │
        ▼
Processing Screen
        │
        ▼
Repository Scanned
        │
        ▼
Python Parsing
        │
        ▼
Knowledge Graph Created
        │
        ▼
Code Chunks Created
        │
        ▼
Embeddings Created
        │
        ▼
Vector Index Created
        │
        ▼
Processing Complete
        │
        ▼
Knowledge Base Ready
        │
        ▼
Query Interface
```

---

# 7. React Application Pages

Create the following pages.

```text
/login
/applications
/applications/new
/applications/:id
/applications/:id/processing
/applications/:id/knowledge-base
/applications/:id/query
```

Authentication can initially be mocked.

Design the authentication interfaces so real authentication can be added later.

---

# 8. Main Application Layout

Use a professional enterprise UI.

Recommended layout:

```text
┌─────────────────────────────────────────────────────────────┐
│ Logo / Application Name                   User / Profile    │
├──────────────┬──────────────────────────────────────────────┤
│              │                                               │
│ Applications │                                               │
│              │                Main Content                   │
│ + New App    │                                               │
│              │                                               │
│ Settings     │                                               │
│              │                                               │
└──────────────┴──────────────────────────────────────────────┘
```

Use a clean, modern enterprise design.

Do not make the UI look like a generic developer dashboard.

Prioritize:

- clarity
- status visibility
- minimal cognitive load
- readable code/evidence
- strong visual hierarchy

---

# 9. Applications Dashboard

Route:

```text
/applications
```

Display:

```text
Applications

[ + Create Application ]

┌─────────────────────────────────────────────────────────────┐
│ Payment Platform                                             │
│ AA-12345                                                    │
│ GitLab: team/payment-platform                               │
│                                                             │
│ Status: Ready                                               │
│ Files: 1,248                                                │
│ Symbols: 8,932                                              │
│ Relationships: 21,421                                       │
│                                                             │
│ Last indexed: 25 Aug 2026                                  │
│                                                             │
│ [Open Knowledge Base] [Re-index]                            │
└─────────────────────────────────────────────────────────────┘
```

Application cards should clearly show:

- Application name
- AA/application number
- Repository
- Branch
- Processing status
- Last indexed time
- Number of files
- Number of symbols
- Number of relationships

---

# 10. Create Application Page

Route:

```text
/applications/new
```

Create a form:

```text
Create Application

Application Name
[________________________________]

AA / Application Number
[________________________________]

GitLab Repository URL
[________________________________]

GitLab Branch
[ main ▼ ]

GitLab Access
[ Connect GitLab ]

                        [Create & Analyze]
```

The form must validate:

### Application name

Required.

### AA/Application number

Required.

Treat this as an identifier.

Do not expose or log sensitive identifiers unnecessarily.

### GitLab repository URL

Required.

Must be a valid GitLab repository URL.

Support:

```text
https://gitlab.com/company/project
```

and self-hosted GitLab installations where configured.

### Branch

Default:

```text
main
```

Allow the user to change it.

---

# 11. GitLab Integration

The system must support GitLab repositories.

Do not ask users to paste repository source code manually.

The Node.js backend should integrate with GitLab.

Create an abstraction:

```typescript
interface GitLabProvider {
    validateRepository(url: string): Promise<RepositoryInfo>;
    listBranches(url: string): Promise<Branch[]>;
    cloneRepository(...): Promise<RepositoryReference>;
    getLatestCommit(...): Promise<CommitInfo>;
}
```

Do not put GitLab SDK-specific code throughout the application.

Implement:

```text
GitLabProvider
    ↓
GitLabClient
```

so GitLab can later be replaced or extended.

---

# 12. GitLab Authentication

Support a configurable GitLab authentication mechanism.

For the initial version, use an environment-configured GitLab token.

Do not store the token in the browser.

The React application must never receive the GitLab access token.

Flow:

```text
React
  │
  │ repository URL
  ▼
Node.js
  │
  │ GitLab credentials
  ▼
GitLab
```

Later support OAuth/OIDC or per-user GitLab authorization.

---

# 13. Repository Access

When the user submits:

```text
https://gitlab.company.com/team/payment-platform
```

the Node backend should:

1. Validate URL
2. Verify repository exists
3. Verify access
4. Verify branch
5. Retrieve repository metadata
6. Create an application
7. Create an indexing job
8. Send repository information to Python
9. Start processing

Never send GitLab credentials to the Python service unless explicitly required.

Prefer:

```text
Node.js
   ↓
GitLab clone/download
   ↓
temporary repository location
   ↓
Python indexing service
```

or a secure internal repository reference.

---

# 14. Processing Job

Every repository indexing operation must create a job.

Example:

```typescript
interface ProcessingJob {
  id: string;
  applicationId: string;
  status: ProcessingStatus;
  progress: number;
  currentStage: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
}
```

Statuses:

```text
QUEUED
CLONING
SCANNING
PARSING
BUILDING_GRAPH
CREATING_CHUNKS
GENERATING_EMBEDDINGS
BUILDING_VECTOR_INDEX
FINALIZING
COMPLETED
FAILED
CANCELLED
```

---

# 15. Processing UI

After clicking:

```text
Create & Analyze
```

redirect the user to:

```text
/applications/:id/processing
```

Show a dedicated processing screen.

Example:

```text
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                 Building your Knowledge Base                │
│                                                             │
│                  Payment Platform                           │
│                                                             │
│                       64%                                   │
│                  ████████████░░░░                           │
│                                                             │
│              Building knowledge graph                       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ✓ Repository connected                                      │
│ ✓ Repository scanned                                        │
│ ✓ Python files parsed                                       │
│ ✓ Symbols extracted                                         │
│ ✓ Relationships extracted                                   │
│ ● Building knowledge graph                                  │
│ ○ Creating semantic chunks                                  │
│ ○ Generating embeddings                                     │
│ ○ Building vector index                                     │
│ ○ Finalizing                                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

The user should always know:

- what is happening
- how far the process has progressed
- what has completed
- what is currently running
- what remains

---

# 16. Processing Statistics

During processing, display useful statistics.

Example:

```text
Repository
1,248 files

Python files
834

Symbols discovered
8,932

Relationships discovered
21,421

Code chunks
12,450

Embeddings
8,210 / 12,450
```

Update these values as processing progresses.

Do not fake progress.

Progress should come from actual backend/indexing state.

---

# 17. Real-Time Processing Updates

Use Server-Sent Events (SSE) or WebSockets.

Prefer SSE initially because processing status is primarily server → client.

Endpoint:

```text
GET /api/applications/:id/jobs/:jobId/events
```

Example event:

```json
{
  "status": "BUILDING_GRAPH",
  "progress": 64,
  "message": "Building knowledge graph",
  "stats": {
    "files": 1248,
    "symbols": 8932,
    "relationships": 21421
  }
}
```

React should subscribe to the event stream.

If SSE disconnects, automatically fall back to polling.

---

# 18. Processing Logs

Provide an expandable processing log.

Example:

```text
Processing log

22:31:04  Repository connected
22:31:06  1,248 files discovered
22:31:12  Parsing Python files
22:31:18  8,932 symbols extracted
22:31:24  21,421 relationships created
22:31:28  Creating semantic chunks
22:31:41  Generating embeddings
```

Do not expose sensitive GitLab credentials or source-code contents in logs.

---

# 19. Successful Completion Screen

When processing finishes:

```text
Knowledge Base Ready

✓ Repository analyzed successfully

Payment Platform

1,248 files
8,932 symbols
21,421 relationships
12,450 code chunks

Indexed commit:
abc123def

                    [Start Querying]
```

The primary action should be:

```text
Start Querying
```

---

# 20. Failed Processing

If processing fails:

```text
Knowledge Base Creation Failed

We couldn't finish analyzing this repository.

Stage:
Generating embeddings

Error:
Embedding provider unavailable.

[Retry]
[Back to Application]
```

Do not show raw stack traces to normal users.

Provide detailed stack traces only in backend logs.

---

# 21. Knowledge Base Dashboard

After completion:

```text
/applications/:id/knowledge-base
```

Display:

```text
Payment Platform

Knowledge Base
────────────────────────────────────────────────────────────

Status
READY

Repository
team/payment-platform

Branch
main

Commit
abc123def

Last indexed
25 Aug 2026

────────────────────────────────────────────────────────────

Files              1,248
Classes               843
Functions           8,932
Relationships       21,421
Code chunks        12,450

────────────────────────────────────────────────────────────

[ Query Knowledge Base ]

[ View Graph ]

[ Re-index ]
```

---

# 22. Knowledge Graph Visualization

Create:

```text
/applications/:id/knowledge-base/graph
```

Provide an interactive graph visualization.

The graph should show:

```text
Class
Function
Method
File
Module
API
Test
```

with relationships:

```text
CALLS
IMPORTS
EXTENDS
DEFINES
TESTS
USES
```

Example:

```text
                 ┌──────────────┐
                 │ UserController│
                 └───────┬──────┘
                         │ CALLS
                         ▼
                 ┌──────────────┐
                 │ UserService  │
                 └───────┬──────┘
                         │ CALLS
                         ▼
                 ┌──────────────┐
                 │UserRepository│
                 └──────────────┘
```

The graph UI should support:

- zoom
- pan
- node selection
- relationship highlighting
- node search
- filtering by node type
- filtering by relationship
- opening source file
- showing source lines

Do not attempt to render the entire graph at once for large repositories.

Start with a focused subgraph.

---

# 23. Query Interface

Route:

```text
/applications/:id/query
```

This is the main user experience.

Design it similarly to a modern AI assistant.

Example:

```text
┌─────────────────────────────────────────────────────────────┐
│ Payment Platform                           Knowledge Base ● │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Ask anything about this codebase                            │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ How does authentication work in this application?      │ │
│ │                                                         │ │
│ │                                           [Ask →]       │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Suggested questions                                         │
│                                                             │
│ • How does authentication work?                             │
│ • What happens when a payment is created?                   │
│ • Which services call PaymentService?                       │
│ • Where is JWT validation implemented?                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

# 24. Query Workflow

When the user asks a question:

```text
React
  │
  ▼
Node.js
  │
  ▼
Python Query Service
  │
  ├── Query classification
  │
  ├── Vector retrieval
  │
  ├── Graph retrieval
  │
  ├── Hybrid retrieval
  │
  ├── Evidence construction
  │
  ▼
LLM
  │
  ▼
Grounded answer
  │
  ▼
Node.js
  │
  ▼
React
```

---

# 25. Query Loading State

While answering:

```text
Analyzing your question...

✓ Understanding query
✓ Searching code
✓ Traversing knowledge graph
● Building answer
```

Do not simply show:

```text
Loading...
```

Show meaningful progress where possible.

---

# 26. Answer UI

Example:

```text
How does authentication work?

Authentication is handled primarily by the authentication
service.

The flow is:

LoginController
       ↓
AuthService
       ↓
JWTValidator
       ↓
UserRepository

### 1. LoginController

The request enters through:

src/api/auth_controller.py:20-41

[View source]

### 2. Authentication Service

Authentication is performed by:

src/services/auth_service.py:31-72

[View source]

### 3. JWT Validation

Token validation occurs in:

src/security/jwt.py:10-38

[View source]
```

The answer should distinguish:

```text
Fact
Inference
Uncertain
```

when necessary.

---

# 27. Source Code Viewer

When the user clicks:

```text
[View source]
```

open a code viewer.

Example:

```text
┌─────────────────────────────────────────────────────────────┐
│ src/services/auth_service.py                               │
├───────┬─────────────────────────────────────────────────────┤
│ 31    │ def authenticate(self, username, password):         │
│ 32    │     user = self.repository.find(username)           │
│ 33    │     if not user:                                    │
│ 34    │         raise AuthenticationError()                  │
│ ...   │                                                     │
│ 72    │                                                     │
└───────┴─────────────────────────────────────────────────────┘
```

Highlight the relevant lines.

The source viewer must clearly identify:

- file
- line numbers
- symbol
- repository
- commit

---

# 28. Citation Interaction

Citations in answers should be clickable.

Example:

```text
Authentication is handled by AuthService
[src/services/auth_service.py:31-72]
```

Clicking the citation opens the source viewer at those lines.

---

# 29. Graph Context in Query Answers

For architecture questions, show an optional:

```text
How we found this
```

section.

Example:

```text
Evidence path

LoginController
   │
   └── CALLS
       ↓
AuthService.authenticate()
   │
   └── CALLS
       ↓
JWTValidator.validate()
```

This allows users to understand why the system reached its conclusion.

---

# 30. Query History

Store query history at the Node.js application layer.

Display:

```text
Recent questions

How does authentication work?
2 minutes ago

What calls PaymentService?
5 minutes ago

How are orders persisted?
Yesterday
```

Clicking a previous query should reopen the answer.

The query history should not contain unnecessary source-code copies.

---

# 31. Empty Knowledge Base State

If the user opens an application before processing:

```text
Knowledge Base Not Ready

This application has not been indexed yet.

Connect the repository and start analysis to create
your knowledge base.

[Start Analysis]
```

Do not show the query UI until the knowledge base is ready.

---

# 32. Query Restrictions

The query endpoint must verify:

```text
application exists
AND
application belongs to authenticated user/tenant
AND
knowledge base status == READY
```

Never allow a query against an arbitrary repository ID.

---

# 33. Node.js API

Implement:

## Applications

```text
POST   /api/applications
GET    /api/applications
GET    /api/applications/:id
DELETE /api/applications/:id
```

## GitLab

```text
POST /api/gitlab/validate
GET  /api/gitlab/branches
```

## Processing

```text
POST /api/applications/:id/index
GET  /api/applications/:id/jobs/:jobId
GET  /api/applications/:id/jobs/:jobId/events
POST /api/applications/:id/jobs/:jobId/cancel
```

## Knowledge base

```text
GET /api/applications/:id/knowledge-base
GET /api/applications/:id/knowledge-base/stats
GET /api/applications/:id/knowledge-base/graph
```

## Query

```text
POST /api/applications/:id/query
GET  /api/applications/:id/query-history
GET  /api/applications/:id/query-history/:queryId
```

## Source

```text
GET /api/applications/:id/source
```

---

# 34. Node.js → Python Communication

Create a Python client in Node.js:

```typescript
interface CodeIntelligenceClient {
  indexRepository(request: IndexRequest): Promise<IndexJob>;

  getIndexStatus(jobId: string): Promise<IndexStatus>;

  query(request: QueryRequest): Promise<QueryResponse>;

  getRepositoryStats(repositoryId: string): Promise<RepositoryStats>;

  getGraph(request: GraphRequest): Promise<GraphResponse>;
}
```

The Node backend must not know the internal implementation of the Python service.

---

# 35. Python Internal API

Expose:

```text
POST /internal/index
GET  /internal/index/{job_id}
POST /internal/query
GET  /internal/repositories/{repository_id}/stats
GET  /internal/repositories/{repository_id}/graph
GET  /internal/repositories/{repository_id}/source
```

Example:

```json
{
  "repository_id": "app_123",
  "repository_path": "/workspace/repos/app_123",
  "commit_hash": "abc123"
}
```

---

# 36. Job Architecture

The initial version may use an in-memory job manager.

Example:

```python
class JobManager:
    jobs: dict[str, Job]
```

The architecture must allow this to later become:

```text
Redis
Celery
BullMQ
Azure Service Bus
RabbitMQ
```

Do not make the React frontend dependent on the job implementation.

---

# 37. Frontend Technology

Use:

```text
React
TypeScript
Vite
React Router
TanStack Query
```

Use a component library if useful, but keep the application architecture clean.

Recommended components:

```text
ApplicationCard
ApplicationForm
RepositoryForm
ProcessingStatus
ProcessingTimeline
ProcessingStats
KnowledgeBaseStats
QueryInput
QuerySuggestions
AnswerView
Citation
SourceViewer
GraphViewer
QueryHistory
ErrorState
EmptyState
LoadingState
```

---

# 38. React State Management

Use TanStack Query for server state.

Do not put all server state into a global Redux store.

Use local React state for:

- form state
- selected graph node
- query input
- source viewer state
- UI filters

Use server-state tools for:

- applications
- processing jobs
- query history
- knowledge-base stats

---

# 39. UI State Model

The application should have clear states:

```text
NEW
CONFIGURING
QUEUED
PROCESSING
READY
FAILED
```

Map these states consistently across the UI.

Example:

```text
NEW       → Setup
QUEUED    → Waiting
PROCESSING → Analyzing
READY     → Ready
FAILED    → Failed
```

---

# 40. Responsive Design

The UI must work on:

- desktop
- laptop
- tablet

Prioritize desktop because code exploration is primarily a desktop workflow.

The query interface should remain usable on smaller screens.

The source-code viewer should allow horizontal scrolling inside the code region rather than causing page-level horizontal scrolling.

---

# 41. Accessibility

Use:

- semantic HTML
- keyboard navigation
- visible focus states
- accessible labels
- aria-live for processing updates
- sufficient color contrast
- buttons instead of clickable divs

Do not rely solely on colors to communicate processing status.

---

# 42. Error Handling in React

Handle:

```text
GitLab repository inaccessible
Invalid repository URL
Invalid branch
GitLab authentication failure
Indexing failure
Python service unavailable
LLM unavailable
No search results
Query timeout
Network failure
SSE disconnect
```

Every error should provide a useful user action.

Examples:

```text
GitLab authentication failed.

[Reconnect GitLab]
```

or:

```text
Knowledge base creation failed.

[Retry indexing]
```

---

# 43. Application Detail Navigation

After processing is complete, the application page should have tabs:

```text
Overview
Knowledge Base
Query
Graph
Processing History
```

Example:

```text
Payment Platform

[Overview] [Knowledge Base] [Query] [Graph] [Processing History]
```

---

# 44. Processing History

Display previous indexing jobs:

```text
Processing History

25 Aug 2026
Commit abc123
Completed
1,248 files
8,932 symbols

24 Aug 2026
Commit 982abc
Completed
1,231 files
8,801 symbols

22 Aug 2026
Commit 12ab34
Failed
Embedding service unavailable
```

This should prepare the application for version-aware indexing later.

---

# 45. Re-indexing

Provide:

```text
[Re-index]
```

When clicked:

```text
Are you sure?

The repository will be checked for changes and the
knowledge base will be incrementally updated.

[Cancel] [Start Re-indexing]
```

The system must use incremental indexing.

Do not rebuild unchanged files unnecessarily.

---

# 46. Query UX Enhancements

Provide suggested queries based on the indexed repository.

Examples:

```text
Understand the architecture

"How does authentication work?"

"Explain the payment flow"

"How are users persisted?"

Explore dependencies

"What calls PaymentService?"

"What depends on UserRepository?"

Find implementation

"Where is JWT validation implemented?"

"Where is the POST /payments endpoint?"
```

These are only suggestions; the user can ask arbitrary questions.

---

# 47. Query Response Structure

Node.js should return:

```json
{
  "queryId": "query_123",
  "query": "How does authentication work?",
  "queryType": "hybrid",
  "answer": "...",
  "citations": [
    {
      "filePath": "src/auth/service.py",
      "startLine": 31,
      "endLine": 72,
      "symbolId": "..."
    }
  ],
  "graphPath": [
    {
      "source": "LoginController",
      "relationship": "CALLS",
      "target": "AuthService"
    }
  ],
  "metadata": {
    "filesRetrieved": 5,
    "symbolsRetrieved": 13,
    "graphNodesRetrieved": 18
  }
}
```

---

# 48. Security Boundaries

The React application must never receive:

- GitLab access tokens
- LLM API keys
- embedding API keys
- internal Python service credentials

The browser communicates only with Node.js.

Node.js communicates with:

- GitLab
- Python service
- future database
- future authentication provider

The Python service communicates with:

- LLM provider
- embedding provider
- in-memory graph
- in-memory vector store

---

# 49. Source Code Security

Treat repository source code as sensitive.

Do not:

- log entire source files
- include source code in normal application logs
- expose repository files through arbitrary filesystem endpoints
- allow arbitrary filesystem paths from the frontend
- execute repository code
- trust repository-provided scripts

The repository should be analyzed as data.

Do not run:

```text
pip install -r requirements.txt
npm install
mvn install
python setup.py
```

as part of indexing.

Do not execute repository code during indexing.

---

# 50. Repository Isolation

Every application must have its own:

```text
application_id
repository_id
graph namespace
vector namespace
processing jobs
query history
```

Even though the initial graph/vector stores are in-memory, implement repository scoping now.

For example:

```python
graph_store.find_nodes(
    repository_id=repository_id,
    ...
)
```

Never perform global graph searches without repository scope.

---

# 51. UI Folder Structure

Use:

```text
frontend/
├── src/
│   ├── api/
│   │   ├── applications.ts
│   │   ├── gitlab.ts
│   │   ├── jobs.ts
│   │   ├── knowledgeBase.ts
│   │   └── queries.ts
│   │
│   ├── components/
│   │   ├── applications/
│   │   ├── processing/
│   │   ├── knowledge-base/
│   │   ├── query/
│   │   ├── graph/
│   │   └── common/
│   │
│   ├── pages/
│   │   ├── ApplicationsPage.tsx
│   │   ├── CreateApplicationPage.tsx
│   │   ├── ApplicationPage.tsx
│   │   ├── ProcessingPage.tsx
│   │   ├── KnowledgeBasePage.tsx
│   │   └── QueryPage.tsx
│   │
│   ├── hooks/
│   ├── types/
│   ├── router/
│   ├── utils/
│   └── App.tsx
│
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

# 52. Node.js Folder Structure

Use:

```text
backend/
├── src/
│   ├── api/
│   │   ├── applications/
│   │   ├── gitlab/
│   │   ├── jobs/
│   │   ├── knowledge-base/
│   │   └── queries/
│   │
│   ├── services/
│   │   ├── application.service.ts
│   │   ├── gitlab.service.ts
│   │   ├── indexing.service.ts
│   │   ├── query.service.ts
│   │   └── source.service.ts
│   │
│   ├── clients/
│   │   ├── gitlab.client.ts
│   │   └── code-intelligence.client.ts
│   │
│   ├── repositories/
│   │   ├── application.repository.ts
│   │   └── job.repository.ts
│   │
│   ├── models/
│   ├── middleware/
│   ├── config/
│   ├── utils/
│   └── server.ts
│
├── tests/
├── package.json
└── tsconfig.json
```

Initially the Node repositories may use in-memory persistence as well.

Keep them behind interfaces so PostgreSQL can be introduced later.

---

# 53. Complete Repository Structure

The final repository should look like:

```text
code-intelligence/
│
├── PROJECT_REQUIREMENTS.md
├── AGENTS.md
├── README.md
├── docker-compose.yml
│
├── frontend/
│   ├── src/
│   ├── package.json
│   └── ...
│
├── backend/
│   ├── src/
│   ├── tests/
│   ├── package.json
│   └── ...
│
├── code-intelligence/
│   ├── app/
│   │   ├── domain/
│   │   ├── parsing/
│   │   ├── ingestion/
│   │   ├── graph/
│   │   ├── vector/
│   │   ├── embeddings/
│   │   ├── llm/
│   │   ├── retrieval/
│   │   ├── query/
│   │   ├── services/
│   │   └── api/
│   │
│   └── tests/
│
└── test-repository/
```

---

# 54. End-to-End User Journey

The entire product must support this workflow:

```text
                    USER
                     │
                     ▼
              Applications
                     │
                     ▼
            Create Application
                     │
          ┌──────────┴──────────┐
          │                     │
          ▼                     ▼
     AA Number             GitLab URL
          │                     │
          └──────────┬──────────┘
                     ▼
                  Branch
                     │
                     ▼
              Create & Analyze
                     │
                     ▼
                Node.js
                     │
                     ▼
              GitLab Validation
                     │
                     ▼
              Repository Access
                     │
                     ▼
              Indexing Job
                     │
                     ▼
             Python Service
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
      Code Parser          Code Chunks
          │                     │
          ▼                     ▼
    Knowledge Graph        Embeddings
          │                     │
          ▼                     ▼
 InMemoryGraphStore     InMemoryVectorStore
          │                     │
          └──────────┬──────────┘
                     ▼
               READY
                     │
                     ▼
              Query Knowledge
                     │
                     ▼
                User Query
                     │
                     ▼
              Hybrid Retrieval
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
       Vector                 Graph
       Search                Traversal
          │                     │
          └──────────┬──────────┘
                     ▼
                  Evidence
                     │
                     ▼
                    LLM
                     │
                     ▼
             Grounded Answer
                     │
                     ▼
             Source Citations
```

---

# 55. Implementation Order

Implement the complete application in this order:

## Phase 1 — Project scaffolding

Create:

```text
frontend
backend
code-intelligence
```

Make all three start successfully.

---

## Phase 2 — Node.js application API

Implement:

```text
Application
ApplicationRepository
ApplicationService
```

Initially use in-memory persistence.

---

## Phase 3 — React application

Implement:

```text
Applications dashboard
Create application
Application details
```

---

## Phase 4 — GitLab integration

Implement:

```text
GitLabClient
GitLabService
Repository validation
Branch discovery
Repository access
```

---

## Phase 5 — Python code intelligence

Implement the original requirements:

```text
scanner
Tree-sitter
IR
graph
chunks
embeddings
retrieval
query engine
```

---

## Phase 6 — Node → Python integration

Implement:

```text
CodeIntelligenceClient
```

and connect indexing.

---

## Phase 7 — Processing UI

Implement:

```text
Processing page
SSE
Progress
Stages
Statistics
Logs
Errors
```

---

## Phase 8 — Knowledge Base UI

Implement:

```text
Knowledge base dashboard
Statistics
Graph visualization
Source viewer
```

---

## Phase 9 — Query UI

Implement:

```text
Query input
Suggestions
Loading state
Answer
Citations
Source viewer
Graph evidence
Query history
```

---

## Phase 10 — End-to-End Testing

Test:

```text
Create application
      ↓
GitLab repository
      ↓
Index
      ↓
Knowledge base
      ↓
Query
      ↓
Answer
      ↓
Citation
```

---

# 56. Important Instruction to the Coding Agent

Do not create a superficial mock application.

The UI should be wired to real APIs.

The indexing progress should come from the real Python indexing pipeline.

The query page should execute real retrieval against the in-memory graph and vector stores.

Do not hard-code fake statistics such as:

```text
1,248 files
8,932 symbols
21,421 relationships
```

Those numbers are examples only.

The UI must display actual values returned by the backend.

Similarly, do not hard-code fake processing progress.

The backend must expose real processing state.

---

# 57. Important Development Rule

Build the application vertically.

After each phase, make the entire workflow usable.

For example:

```text
Phase 1:
Frontend → Node.js → Application creation

Phase 2:
Frontend → Node.js → GitLab validation

Phase 3:
Frontend → Node.js → Python → indexing

Phase 4:
Frontend → Node.js → Python → graph/vector retrieval

Phase 5:
Frontend → Node.js → Python → LLM → answer
```

Do not build the entire frontend independently from the backend and integrate everything at the end.

---

# 58. Definition of Done

The initial system is considered complete when a user can:

1. Open the React application.
2. Create an application.
3. Enter an AA/application number.
4. Enter a GitLab repository URL.
5. Select a branch.
6. Submit the application.
7. See GitLab validation.
8. See repository processing begin.
9. See real-time indexing progress.
10. See parsing progress.
11. See graph-building progress.
12. See embedding progress.
13. See indexing statistics.
14. See successful completion.
15. Open the generated knowledge base.
16. See graph statistics.
17. Explore the generated graph.
18. Search/query the knowledge base.
19. Receive a grounded answer.
20. See source-file citations.
21. Click a citation.
22. Open the relevant source code and lines.
23. See the graph path/evidence behind the answer.
24. Ask another question.
25. View previous queries.
26. Re-index the repository.
27. Have unchanged files skipped during incremental indexing.
28. Recover gracefully from indexing/query failures.

---

# 59. Final Architecture Principle

The system must preserve this separation:

```text
┌───────────────────────────────────────────────┐
│                  React UI                     │
│                                               │
│ Presentation only                             │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────┐
│                  Node.js                      │
│                                               │
│ Application orchestration                    │
│ GitLab integration                            │
│ Jobs                                          │
│ API                                           │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────┐
│                  Python                       │
│                                               │
│ Code intelligence                             │
│ Parsing                                       │
│ Knowledge graph                               │
│ Vector retrieval                              │
│ GraphRAG                                      │
└───────────────────────┬───────────────────────┘
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
       InMemoryGraphStore   InMemoryVectorStore
```

The database implementations must remain replaceable.

The UI must remain independent of the Python implementation.

The Node backend must remain independent of the graph/vector database.

The Python code-intelligence layer must remain independent of the specific graph/vector database.

This architecture should allow the following future migration without rewriting the system:

```text
Current:

InMemoryGraphStore
InMemoryVectorStore
InMemoryApplicationRepository

        ↓

Future:

Neo4j
Qdrant / pgvector / Neo4j Vector
PostgreSQL
```

Only adapters/configuration should need to change.
