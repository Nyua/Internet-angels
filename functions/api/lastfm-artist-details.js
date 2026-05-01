import {
  LASTFM_DETAILS_ROUTE_TIMEOUT_MS,
  LASTFM_ARTIST_DETAILS_FRESH_TTL_SEC,
  LASTFM_ARTIST_DETAILS_RETAIN_TTL_SEC
} from "../lib/config.js";
import { buildEmptyLastFmArtistDetailsPayload, fetchLastFmArtistDetails } from "../lib/lastfm-details.js";
import {
  buildLastFmDetailsCacheRequest,
  createLastFmDetailsRouteHandler,
  normalizeLastFmDetailsQueryValue
} from "../lib/lastfm-details-route.js";

const MAX_QUERY_LENGTH = 160;

function validateQuery(query) {
  if (!query.artist) {
    return "artist is required";
  }
  if (query.artist.length > MAX_QUERY_LENGTH) {
    return `artist must be ${MAX_QUERY_LENGTH} characters or fewer`;
  }
  return "";
}

export const onRequest = createLastFmDetailsRouteHandler({
  routeTimeoutMs: LASTFM_DETAILS_ROUTE_TIMEOUT_MS,
  freshTtlSec: LASTFM_ARTIST_DETAILS_FRESH_TTL_SEC,
  retainTtlSec: LASTFM_ARTIST_DETAILS_RETAIN_TTL_SEC,
  readQuery(requestUrl) {
    return {
      artist: normalizeLastFmDetailsQueryValue(requestUrl.searchParams.get("artist"))
    };
  },
  validateQuery,
  buildCacheRequest(request, query) {
    return buildLastFmDetailsCacheRequest(request, query, ["artist"]);
  },
  buildEmptyPayload: buildEmptyLastFmArtistDetailsPayload,
  fetchPayload({ apiKey, query, nowMs, signal }) {
    return fetchLastFmArtistDetails({
      apiKey,
      artist: query.artist,
      nowMs,
      signal
    });
  },
  timeoutError: "Last.fm artist details timed out",
  unavailableError: "Last.fm artist details unavailable"
});
