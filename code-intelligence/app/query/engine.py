"""Assembles the final query response: retrieve evidence, generate an
answer grounded in it, and shape the result to match the contract the
Node backend (and, through it, the frontend) expects (spec §47)."""

from __future__ import annotations

import uuid

from app.llm.answer_generator import AnswerGenerator
from app.retrieval.hybrid_retriever import HybridRetriever


class QueryEngine:
    def __init__(self, hybrid_retriever: HybridRetriever, answer_generator: AnswerGenerator):
        self.hybrid_retriever = hybrid_retriever
        self.answer_generator = answer_generator

    def query(self, repository_id: str, query_text: str) -> dict:
        retrieval = self.hybrid_retriever.retrieve(repository_id, query_text)
        result = self.answer_generator.generate(query_text, retrieval)

        symbols_retrieved = {s.id for s in retrieval.matched_symbols}
        symbols_retrieved.update(c.symbol_id for c, _ in retrieval.chunks if c.symbol_id)

        return {
            "queryId": f"query_{uuid.uuid4()}",
            "query": query_text,
            "queryType": retrieval.query_type,
            "answer": result["answer"],
            "basis": result["basis"],
            "citations": retrieval.citations,
            "graphPath": retrieval.graph_path,
            "metadata": {
                "filesRetrieved": len({c["filePath"] for c in retrieval.citations}),
                "symbolsRetrieved": len(symbols_retrieved),
                "graphNodesRetrieved": len(retrieval.graph_nodes),
            },
        }
