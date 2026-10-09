import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { getJob, jobEventsUrl } from "../api/jobs.js";

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
const POLL_INTERVAL_MS = 1500;

/**
 * Subscribes to real-time job progress over SSE (spec §17). If the
 * stream errors or is unavailable (e.g. EventSource unsupported, proxy
 * buffering, network hiccup), falls back to polling automatically -
 * the caller never needs to know which transport is active.
 */
export function useProcessingJob(applicationId, jobId) {
  const [job, setJob] = useState(null);
  const [connection, setConnection] = useState("connecting"); // connecting | live | polling

  const isDone = job ? TERMINAL_STATUSES.has(job.status) : false;

  const pollQuery = useQuery({
    queryKey: ["job-poll", applicationId, jobId],
    queryFn: () => getJob(applicationId, jobId),
    enabled: Boolean(applicationId && jobId) && (connection === "polling" || connection === "connecting"),
    refetchInterval: isDone ? false : POLL_INTERVAL_MS,
  });

  useEffect(() => {
    if (!applicationId || !jobId || typeof EventSource === "undefined") {
      setConnection("polling");
      return undefined;
    }

    const source = new EventSource(jobEventsUrl(applicationId, jobId));

    source.onopen = () => setConnection("live");
    source.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setJob((prev) => ({ ...prev, ...data }));
      setConnection("live");
      if (TERMINAL_STATUSES.has(data.status)) {
        source.close();
      }
    };
    source.onerror = () => {
      setConnection("polling");
      source.close();
    };

    return () => source.close();
  }, [applicationId, jobId]);

  useEffect(() => {
    if (pollQuery.data) {
      setJob((prev) => ({ ...prev, ...pollQuery.data }));
    }
  }, [pollQuery.data]);

  return { job, connection, error: connection === "polling" ? pollQuery.error : null };
}
