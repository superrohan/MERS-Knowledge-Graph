import { Link } from "react-router-dom";

import { AccordionItem } from "../components/common/Accordion.jsx";
import { GraphLegend } from "../components/graph/GraphLegend.jsx";

const RELATIONSHIP_ROWS = [
  ["CALLS", "One function/method calls another."],
  ["IMPORTS", "One module imports another, or a name from it."],
  ["EXTENDS", "A class inherits from a base class or implements an interface."],
  ["USES", "A function/method's signature references a type (a parameter or return type)."],
  ["DEFINES", "Structural containment - a module defines a class, a class defines a method."],
  ["TESTS", "A test function targets the function/method its name implies (e.g. test_authenticate_… → authenticate)."],
  ["HANDLES", "An API endpoint is handled by a specific function/method."],
  ["CALLS_API", "A frontend fetch()/axios call resolves to the backend route it targets - by matching HTTP method + path shape, even across two different repositories of the same application."],
];

const VERIFICATION_ROWS = [
  ["✓ Confirmed against code", "The declaration matches an endpoint the parser actually found - trusted as fact in query answers."],
  ["⚠ Conflicts with code", "A matching endpoint was found, but at least one detail (method, auth requirement, mechanism, or roles) disagrees with it. Query answers state what the code actually shows instead of the declaration."],
  ["⛔ No matching endpoint found in code", "No corresponding endpoint was detected anywhere in the indexed code. Its details are never stated as fact."],
  ["❓ Not yet verified against code", "No comparison has run yet, or nothing exists yet to compare against (e.g. before the first index completes). Click \"Re-check against code\" after indexing to update it."],
];

const API_FRAMEWORK_ROWS = [
  ["Python", "Flask / FastAPI", "@app.route(...), @app.get/post/...(...)", "@login_required, @jwt_required, @requires_role(...), FastAPI Depends(...)/Security(...)"],
  ["JavaScript / TypeScript", "Express", "app.get('/path', ...middleware, handler)", "middleware names matching auth/login/jwt/token/guard"],
  ["Java", "Spring", "@GetMapping/@PostMapping/@RequestMapping", "@PreAuthorize/@Secured/@RolesAllowed, plus global SecurityFilterChain / WebSecurityConfigurerAdapter rules"],
];

export function InstructionsPage() {
  return (
    <div className="instructions-page">
      <div className="page-header">
        <div>
          <h1>Instructions</h1>
          <div className="page-header__meta">How to use this platform, and how to read what it tells you</div>
        </div>
      </div>

      <p className="hint" style={{ marginBottom: 20, maxWidth: 720 }}>
        This platform turns a codebase into a real, queryable knowledge graph - not a search index. Everything
        below is grounded in what's actually true of this codebase, so an honest "I don't know" or "this couldn't
        be confirmed" beats a confident guess everywhere in this app.
      </p>

      <div className="stack-sm">
        <AccordionItem icon="🚀" title="Getting started: creating an application" defaultOpen>
          <ol className="instructions-steps">
            <li>
              Click <strong>+ New Application</strong> in the sidebar. Give it a name and an AA/application number
              (your own reference, shown on its card).
            </li>
            <li>
              Enter a GitLab repository URL. A public <code>https://gitlab.com/...</code> repo works with no
              token; for a private one, check <strong>"This repository is private"</strong> and paste a GitLab
              personal access token - it's stored only on the server and never shown again, per repository.
            </li>
            <li>
              An application can span <strong>more than one repository</strong> - e.g. a separate frontend and
              backend - by clicking <strong>+ Add another repository</strong>. Each repository is indexed into
              the <em>same</em> knowledge graph, which is what lets a frontend API call resolve to the backend
              route it targets even though they live in different repos (see "Cross-repo API linking" below).
            </li>
            <li>
              Click <strong>Create &amp; Analyze</strong>. You'll land on a progress page while the repository is
              cloned, parsed, and embedded - this can take anywhere from a few seconds to a couple of minutes
              depending on repository size.
            </li>
          </ol>
        </AccordionItem>

        <AccordionItem icon="📊" title="Understanding the indexing progress page">
          <p>The stats shown while (and after) indexing mean:</p>
          <table className="instructions-table">
            <tbody>
              <tr><td><strong>Repository files</strong></td><td>Every file the scanner found, including ones it can't parse (images, lockfiles, etc.).</td></tr>
              <tr><td><strong>Parsed files</strong></td><td>Files in a supported language (Python, JavaScript/TypeScript, Java) that were actually parsed.</td></tr>
              <tr><td><strong>Symbols discovered</strong></td><td>Every module, class, function, method, and API endpoint found across all parsed files.</td></tr>
              <tr><td><strong>Relationships discovered</strong></td><td>Every edge in the graph - see the relationship types table below.</td></tr>
              <tr><td><strong>Code chunks</strong></td><td>The pieces of source code split up for semantic search - roughly one per function/method (large ones are split further).</td></tr>
              <tr><td><strong>Embeddings</strong></td><td>The number of chunks that have a real vector embedding - always equal to code chunks, since every chunk gets exactly one.</td></tr>
            </tbody>
          </table>
          <p className="hint" style={{ marginTop: 10 }}>
            Re-indexing an application only re-parses files that actually changed since the last run (by content
            hash) - an unchanged file's symbols, relationships, and embeddings are left alone.
          </p>
        </AccordionItem>

        <AccordionItem icon="🕸️" title="Reading the knowledge graph">
          <p>
            The <strong>Graph</strong> tab shows a bounded, interactive view of the code graph - it never renders
            the whole repository at once, only whatever your search/filters (or the most-connected symbols, by
            default) resolve to. Drag to pan, scroll to zoom, click a node to see its details and highlight its
            direct relationships, click again to deselect.
          </p>
          <div className="card" style={{ padding: 14, marginTop: 10, marginBottom: 10 }}>
            <GraphLegend />
          </div>
          <p><strong>Relationship types</strong> (the lines connecting nodes):</p>
          <table className="instructions-table">
            <tbody>
              {RELATIONSHIP_ROWS.map(([type, desc]) => (
                <tr key={type}>
                  <td><span className="badge badge--processing mono" style={{ textTransform: "none" }}>{type}</span></td>
                  <td>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint" style={{ marginTop: 10 }}>
            Selecting a node's detail panel also shows its full API metadata when it's an endpoint - see "API
            endpoint details" below.
          </p>
        </AccordionItem>

        <AccordionItem icon="💬" title="Asking questions, and how to read the answer">
          <p>
            The <strong>Query</strong> tab is a natural-language interface over the same graph and the code's
            embedded chunks. Every answer is grounded in real retrieved evidence - never invented behavior.
          </p>
          <ul className="instructions-list">
            <li>
              An answer with no badge is stated as <strong>Fact</strong> - directly supported by retrieved code
              or graph relationships.
            </li>
            <li>
              An <span className="badge badge--uncertain">Uncertain</span> badge means the retrieval turned up
              nothing clearly relevant - try rephrasing, or naming a specific file/class/function.
            </li>
            <li>
              <strong>Sources</strong> below the answer are the actual code chunks/symbols used - click{" "}
              <strong>View source</strong> on any of them to open the real file at that exact line range, with
              the cited lines highlighted.
            </li>
            <li>
              A <strong>relevant relationships</strong> / graph-evidence section, when shown, is the actual
              traversal path the graph took to connect what you asked about to the evidence - not a summary, the
              real edges.
            </li>
          </ul>
        </AccordionItem>

        <AccordionItem icon="🔌" title="API endpoint details: params, auth, and middleware">
          <p>
            Endpoints are detected automatically per language while parsing - ask something like{" "}
            <em>"what are the authentication requirements for the payments endpoint?"</em> and get a real,
            extracted answer, not a generic summary:
          </p>
          <table className="instructions-table">
            <thead>
              <tr><th>Language</th><th>Framework</th><th>Route detection</th><th>Auth detection</th></tr>
            </thead>
            <tbody>
              {API_FRAMEWORK_ROWS.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, i) => (
                    <td key={i}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginTop: 10 }}>An endpoint's detail panel (in the graph, or a query citation) shows:</p>
          <ul className="instructions-list">
            <li><strong>Params</strong>, each labeled by location (path/query/body/header) and where it came from: <span className="mono">declared</span> means it's explicit in the route's own signature/annotation (certain); <span className="mono">observed</span> means it was found by scanning the handler body for real usage (Flask's <span className="mono">request.args</span>, Express's <span className="mono">req.query</span>) - real, but can't confirm whether it's actually required.</li>
            <li><strong>Middleware chain</strong> - the ordered decorators/middleware/dependencies/annotations a request passes through before the handler runs, in source order. A step's effect is only explained when it's a structurally recognizable auth/role pattern; an unrecognized one is still listed by name, never guessed at.</li>
            <li>For Spring specifically, a matched global <span className="mono">SecurityFilterChain</span> rule (declared in a separate config class) appears as its own middleware step, showing exactly which URL pattern and rule applied.</li>
          </ul>
        </AccordionItem>

        <AccordionItem icon="✍️" title="Declaring an API endpoint manually">
          <p>
            Not every endpoint is visible to the parser - one behind an API gateway, or simply worth documenting
            with auth/role details a human knows that the code doesn't say explicitly. The{" "}
            <strong>API Endpoints</strong> tab on any application (usable even before indexing finishes) lets you
            declare one directly: name, method, route, auth requirement, roles, and free-form notes.
          </p>
          <p>
            A declaration is <strong>never taken at face value</strong>. Every create/update (and an on-demand
            "Re-check against code" button) compares it against what the parser actually detected:
          </p>
          <table className="instructions-table">
            <tbody>
              {VERIFICATION_ROWS.map(([label, desc]) => (
                <tr key={label}>
                  <td style={{ whiteSpace: "nowrap" }}>{label}</td>
                  <td>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint" style={{ marginTop: 10 }}>
            Matching recognizes routes written differently (<span className="mono">/orders/:id</span> vs{" "}
            <span className="mono">/orders/{"{id}"}</span>) more reliably when an OpenAI API key is configured on
            the server - without one, only an exact route match can be confirmed, and anything else is reported
            "not yet verified" rather than guessed at.
          </p>
        </AccordionItem>

        <AccordionItem icon="🔗" title="Multi-repo applications and cross-repo API linking">
          <p>
            One application can span several physical repositories sharing a single knowledge graph. Re-indexing
            one repository never touches another repository's already-resolved symbols or relationships.
          </p>
          <p>
            When a frontend repository calls <span className="mono">fetch(...)</span>/<span className="mono">axios...()</span>,
            that call is matched to the backend route it targets by HTTP method + normalized path shape - this
            produces a real <span className="badge badge--processing mono" style={{ textTransform: "none" }}>CALLS_API</span> edge
            in the graph, connecting the two repositories' code. It only resolves on a unique match, the same
            conservative rule every relationship in the graph follows - never a guess.
          </p>
        </AccordionItem>

        <AccordionItem icon="❓" title="Troubleshooting / FAQ">
          <p><strong>My application shows "Failed" after indexing.</strong> Open the application and check the
          processing log for the real error - almost always a GitLab access issue (wrong URL, missing/expired
          token for a private repo, or wrong branch name).</p>
          <p><strong>The graph looks empty, or missing nodes I expect.</strong> The default view shows only the
          most-connected symbols (plus a reserved slice for API endpoints) up to a limit, to stay readable for a
          large repository - search for a specific name to pull in exactly what you're looking for.</p>
          <p><strong>My question got an "Uncertain" answer.</strong> Try naming a specific file, class, or
          function, or rephrasing - the retrieval found nothing clearly related to the wording used.</p>
          <p><strong>Why do "Code chunks" and "Embeddings" always show the same number?</strong> This isn't a
          bug - every chunk gets exactly one embedding vector, by design, so the two counts are always equal.</p>
        </AccordionItem>
      </div>

      <p className="hint" style={{ marginTop: 24 }}>
        Ready to try it? <Link to="/applications">Go to Applications</Link> or{" "}
        <Link to="/applications/new">create a new one</Link>.
      </p>
    </div>
  );
}
