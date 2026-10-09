# Postgres with Apache AGE (graph) and pgvector (embeddings) in one
# instance. AGE ships pre-built in the base image; pgvector is available
# straight from the PGDG apt repo the base image already trusts.
FROM apache/age:latest

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-18-pgvector \
    && rm -rf /var/lib/apt/lists/*
