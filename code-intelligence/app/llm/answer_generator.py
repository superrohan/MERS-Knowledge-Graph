"""Turns retrieved evidence into an answer.

Two real strategies, never a fabricated one:
  - OpenAILLMProvider: when OPENAI_API_KEY is configured, asks an OpenAI
    chat model to answer strictly from the retrieved evidence.
  - Template fallback: when no key is configured, composes an answer
    directly from the retrieved symbols/citations/graph path - still
    grounded in real retrieval results, just without LLM-polished prose.

If a key *is* configured but the call fails, that is surfaced as
LLMUnavailableError rather than silently falling back, so the required
"LLM unavailable" error state (spec §20/§42) reflects a real failure.
"""

from __future__ import annotations

import logging

from app.config import settings
from app.retrieval.hybrid_retriever import RetrievalResult

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = (
    "You are a code intelligence assistant answering questions about a specific, already-indexed "
    "codebase. Answer ONLY using the evidence provided below - do not invent files, symbols, or "
    "behavior that isn't shown. Reference file paths and line ranges inline, e.g. "
    "`src/services/auth_service.py:31-72`, when pointing to code. If the evidence is thin or "
    "unrelated to the question, say so explicitly instead of guessing.\n\n"
    "When evidence includes API endpoint metadata, it carries several structural signals extracted "
    "directly from the code - state these explicitly and precisely when asked about them, they are "
    "often exactly what's being asked:\n"
    "- method/route/auth_required/auth_mechanism/roles: the endpoint's basic contract.\n"
    "- params: each request parameter's location (path/query/body/header) and a `source` of "
    "\"declared\" (explicit in the route's own signature/annotations - certain) or \"observed\" "
    "(found by scanning the handler body for usage, e.g. request.args/req.query access - real, but "
    "less certain: it can't confirm whether the read is actually required, or catch conditional "
    "reads the scan missed). Query params ARE the structural answer to \"what filtering does this "
    "endpoint support\" - list them when asked about filtering, sorting, or pagination.\n"
    "- middleware_chain: the ordered decorators/middleware/dependencies/annotations - and, for "
    "Spring, matched global SecurityFilterChain rules (kind=\"global_filter\") - a request actually "
    "passes through before the handler runs. This is the real answer to \"what is the middleware "
    "flow to this route\" and \"how is auth implemented here\" - state the chain in order, and quote "
    "each step's `detail` when present (a step with detail=null was detected but its effect isn't "
    "structurally recognized - name it, don't guess what it does).\n\n"
    "Beyond these structural signals, you are also given the full source of relevant handlers below. "
    "When asked about *behavior* those signals don't capture on their own - e.g. what a filter "
    "actually does with a query param, or how an access-control check decides what to allow - read "
    "the shown source and describe what it does, grounded strictly in that code; make clear you are "
    "describing what the code appears to do, not stating a separately-verified fact, and never "
    "describe behavior for a file/function that isn't part of the evidence shown.\n\n"
    "Some API endpoint evidence is marked framework=\"manual\" - a user declared it themselves rather "
    "than it being detected by parsing the code, and it carries a verificationStatus checked against "
    "the actual code graph: \"confirmed\" (matches detected code - state it as fact), \"conflicting\" "
    "(a detected endpoint exists but at least one declared detail contradicts it - say the declaration "
    "is unconfirmed/disputed and state what the code itself actually shows instead), \"no_match\" (no "
    "corresponding endpoint was found in the code at all - say so explicitly rather than asserting the "
    "declared details as fact), or \"unverified\" (not yet checked, e.g. no code has been indexed to "
    "compare against - present it as an unconfirmed, user-provided claim). Never state a "
    "\"conflicting\" or \"no_match\" declaration's details as established fact."
)

_LANGUAGE_FENCE_BY_EXTENSION = {".py": "python", ".js": "javascript", ".jsx": "javascript", ".ts": "typescript", ".tsx": "typescript", ".java": "java"}


class LLMUnavailableError(Exception):
    pass


class AnswerGenerator:
    def generate(self, query_text: str, retrieval: RetrievalResult) -> dict:
        if not retrieval.citations:
            return {
                "answer": (
                    "I couldn't find any code in this repository clearly relevant to that question. "
                    "Try rephrasing, or ask about a specific file, class, or function name."
                ),
                "basis": "UNCERTAIN",
            }

        if settings.openai_api_key:
            return self._generate_with_openai(query_text, retrieval)
        return self._generate_template_answer(query_text, retrieval)

    def _generate_with_openai(self, query_text: str, retrieval: RetrievalResult) -> dict:
        try:
            import openai
        except ImportError as exc:  # pragma: no cover - dependency is pinned in requirements.txt
            raise LLMUnavailableError("The openai package is not installed.") from exc

        try:
            client = openai.OpenAI(api_key=settings.openai_api_key)
            response = client.chat.completions.create(
                model=settings.openai_model,
                max_completion_tokens=1024,
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": f"Question: {query_text}\n\nEvidence:\n{self._format_evidence(retrieval)}",
                    },
                ],
            )
        except Exception as exc:  # noqa: BLE001 - any SDK/network/auth failure
            logger.exception("OpenAI request failed")
            raise LLMUnavailableError(str(exc)) from exc

        text = response.choices[0].message.content or ""
        return {"answer": text.strip(), "basis": "FACT"}

    def _generate_template_answer(self, query_text: str, retrieval: RetrievalResult) -> dict:
        top_citation = retrieval.citations[0]
        primary_name = top_citation.get("symbolName") or top_citation["filePath"]

        lines = [f"Based on the indexed code, `{primary_name}` appears most relevant to this question."]

        api_citations = [c for c in retrieval.citations if c.get("api")]
        # This composer can't reason about a conflict the way the LLM path
        # can (see the OpenAI system prompt) - so it takes the strict
        # reading of "only use what's in the actual code graph": a
        # user-declared endpoint's own details are only ever stated as
        # fact once verification confirms them against the code. An
        # unconfirmed one is called out by name, not by its (unconfirmed)
        # claimed method/auth details.
        confirmed_citations = [c for c in api_citations if c["api"].get("framework") != "manual" or c["api"].get("verificationStatus") == "confirmed"]
        unconfirmed_citations = [c for c in api_citations if c not in confirmed_citations]

        has_observed_param = False
        if confirmed_citations:
            lines.append("")
            lines.append("API endpoints found:")
            for citation in confirmed_citations:
                api = citation["api"]
                method_path = f"{api['httpMethod']} {api['routePath']}".strip()
                auth_note = "no authentication required"
                if api["authRequired"]:
                    auth_note = f"requires authentication ({api['authMechanism'] or 'mechanism not identified'})"
                    if api["requiredRoles"]:
                        auth_note += f", roles: {', '.join(api['requiredRoles'])}"
                flag = self._manual_verification_flag(api)
                lines.append(f"- `{method_path}` — {citation.get('symbolName')}{flag} — {auth_note}")

                query_params = [p for p in api.get("requestParams") or [] if p["location"] == "query"]
                if query_params:
                    names = ", ".join(f"{p['name']}{'*' if p['source'] == 'observed' else ''}" for p in query_params)
                    lines.append(f"  Query/filter params: {names}")
                    has_observed_param = has_observed_param or any(p["source"] == "observed" for p in query_params)

                chain = api.get("middlewareChain") or []
                if chain:
                    step_bits = [
                        f"{step['name']} ({step['detail']})" if step.get("detail") else step["name"] for step in chain
                    ]
                    lines.append(f"  Middleware chain: {' → '.join(step_bits)}")

            if has_observed_param:
                lines.append("  (* found by scanning the handler body's usage, not declared in the route itself)")

        if unconfirmed_citations:
            lines.append("")
            lines.append("Note: the following user-declared endpoint(s) could not be confirmed against the "
                          "indexed code, so their details are not stated as fact here:")
            for citation in unconfirmed_citations:
                api = citation["api"]
                status = api.get("verificationStatus") or "unverified"
                reason = api.get("verificationNotes") or f"status: {status}"
                lines.append(f"- \"{citation.get('symbolName')}\" ({status}) — {reason}")

        if retrieval.graph_path:
            lines.append("")
            lines.append("Relevant relationships found in the knowledge graph:")
            for hop in retrieval.graph_path[:5]:
                lines.append(f"- {hop['source']} —{hop['relationship']}→ {hop['target']}")

        lines.append("")
        lines.append("See the citations below for the exact source.")
        return {"answer": "\n".join(lines), "basis": "FACT"}

    def _format_evidence(self, retrieval: RetrievalResult) -> str:
        parts = []
        api_by_symbol_id = {c["symbolId"]: c["api"] for c in retrieval.citations if c.get("api") and c.get("symbolId")}
        chunk_symbol_ids = {chunk.symbol_id for chunk, _ in retrieval.chunks if chunk.symbol_id}

        for chunk, score in retrieval.chunks:
            ext = chunk.file_path[chunk.file_path.rfind(".") :] if "." in chunk.file_path else ""
            fence_lang = _LANGUAGE_FENCE_BY_EXTENSION.get(ext, "")
            section = [
                f"### {chunk.symbol_name or chunk.file_path} "
                f"({chunk.file_path}:{chunk.start_line}-{chunk.end_line}, relevance={score:.2f})"
            ]
            api = api_by_symbol_id.get(chunk.symbol_id)
            if api:
                section.append(self._format_api_metadata(api))
            section.append(f"```{fence_lang}\n{chunk.text}\n```")
            parts.append("\n".join(section))

        # API endpoints matched by name rather than by a code chunk - most
        # notably user-declared annotations, which have no source text to
        # embed and so never show up in the loop above.
        for symbol_id, api in api_by_symbol_id.items():
            if symbol_id in chunk_symbol_ids:
                continue
            citation = next(c for c in retrieval.citations if c.get("symbolId") == symbol_id)
            section = [f"### {citation.get('symbolName')} ({citation['filePath']})", self._format_api_metadata(api)]
            parts.append("\n".join(section))

        if retrieval.graph_path:
            parts.append("### Graph relationships")
            for hop in retrieval.graph_path:
                parts.append(f"- {hop['source']} {hop['relationship']} {hop['target']}")
        return "\n\n".join(parts)

    def _format_api_metadata(self, api: dict) -> str:
        auth = f"auth_required={api['authRequired']}"
        if api["authRequired"]:
            auth += f" (mechanism={api['authMechanism']}, roles={api['requiredRoles'] or 'none specified'})"
        lines = [f"API: {api['httpMethod']} {api['routePath']} - {auth}"]

        params = api.get("requestParams") or []
        if params:
            param_bits = [f"{p['name']} ({p['location']}, {p['source']}, required={p['required']})" for p in params]
            lines.append(f"params: {', '.join(param_bits)}")

        chain = api.get("middlewareChain") or []
        if chain:
            step_bits = []
            for i, step in enumerate(chain, 1):
                bit = f"{i}. {step['name']} [{step['kind']}]"
                if step.get("detail"):
                    bit += f" - {step['detail']}"
                step_bits.append(bit)
            lines.append("middleware_chain: " + "; ".join(step_bits))

        if api.get("framework") == "manual":
            status = api.get("verificationStatus") or "unverified"
            note = f"[USER-DECLARED, not detected in code; verification against code: {status}"
            if api.get("verificationNotes"):
                note += f" - {api['verificationNotes']}"
            note += "]"
            lines.append(note)
        return "\n".join(lines)

    def _manual_verification_flag(self, api: dict) -> str:
        if api.get("framework") != "manual":
            return ""
        status = api.get("verificationStatus") or "unverified"
        if status == "confirmed":
            return " [user-declared; confirmed against code]"
        if status == "conflicting":
            return " [⚠ user-declared; CONFLICTS with the detected code - not stated as fact]"
        if status == "no_match":
            return " [⚠ user-declared; no matching endpoint found in code - unconfirmed]"
        return " [user-declared; not yet verified against code]"


answer_generator = AnswerGenerator()
