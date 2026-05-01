import {
  LASTFM_DETAILS_ROUTE_TIMEOUT_MS,
  LASTFM_TRACK_DETAILS_FRESH_TTL_SEC,
  LASTFM_TRACK_DETAILS_RETAIN_TTL_SEC
} from "../lib/config.js";
import { buildEmptyLastFmTrackDetailsPayload, fetchLastFmTrackDetails } from "../lib/lastfm-details.js";
import {
  buildLastFmDetailsCacheRequest,
  createLastFmDetailsRouteHandler,
  normalizeLastFmDetailsQueryValue
} from "../lib/lastfm-details-route.js";

const MAX_QUERY_LENGTH = 160;

function validateQuery(query) {
  if (!query.artist || !query.track) {
    return "artist and track are required";
  }
  if (query.artist.length > MAX_QUERY_LENGTH || query.track.length > MAX_QUERY_LENGTH || query.album.length > MAX_QUERY_LENGTH) {
    return `artist, track, and album must be ${MAX_QUERY_LENGTH} characters or fewer`;
  }
  return "";
}

export const onRequest = createLastFmDetailsRouteHandler({
  routeTimeoutMs: LASTFM_DETAILS_ROUTE_TIMEOUT_MS,
  freshTtlSec: LASTFM_TRACK_DETAILS_FRESH_TTL_SEC,
  retainTtlSec: LASTFM_TRACK_DETAILS_RETAIN_TTL_SEC,
  readQuery(requestUrl) {
    return {
      artist: normalizeLastFmDetailsQueryValue(requestUrl.searchParams.get("artist")),
      track: normalizeLastFmDetailsQueryValue(requestUrl.searchParams.get("track")),
      album: normalizeLastFmDetailsQueryValue(requestUrl.searchParams.get("album"))
    };
  },
  validateQuery,
  buildCacheRequest(request, query) {
    return buildLastFmDetailsCacheRequest(request, query, ["artist", "track", "album"]);
  },
  buildEmptyPayload: buildEmptyLastFmTrackDetailsPayload,
  fetchPayload({ apiKey, env, query, nowMs, signal }) {
    return fetchLastFmTrackDetails({
      apiKey,
      env,
      artist: query.artist,
      track: query.track,
      album: query.album,
      nowMs,
      signal
    });
  },
  timeoutError: "Last.fm track details timed out",
  unavailableError: "Last.fm track details unavailable"
});
