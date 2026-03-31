import {
  LASTFM_ALBUM_DETAILS_FRESH_TTL_SEC,
  LASTFM_ALBUM_DETAILS_RETAIN_TTL_SEC
} from "../lib/config.js";
import { buildEmptyLastFmAlbumDetailsPayload, fetchLastFmAlbumDetails } from "../lib/lastfm-details.js";
import {
  buildLastFmDetailsCacheRequest,
  createLastFmDetailsRouteHandler,
  normalizeLastFmDetailsQueryValue
} from "../lib/lastfm-details-route.js";

const MAX_QUERY_LENGTH = 160;

function validateQuery(query) {
  if (!query.artist || !query.album) {
    return "artist and album are required";
  }
  if (query.artist.length > MAX_QUERY_LENGTH || query.album.length > MAX_QUERY_LENGTH) {
    return `artist and album must be ${MAX_QUERY_LENGTH} characters or fewer`;
  }
  return "";
}

export const onRequest = createLastFmDetailsRouteHandler({
  freshTtlSec: LASTFM_ALBUM_DETAILS_FRESH_TTL_SEC,
  retainTtlSec: LASTFM_ALBUM_DETAILS_RETAIN_TTL_SEC,
  readQuery(requestUrl) {
    return {
      artist: normalizeLastFmDetailsQueryValue(requestUrl.searchParams.get("artist")),
      album: normalizeLastFmDetailsQueryValue(requestUrl.searchParams.get("album"))
    };
  },
  validateQuery,
  buildCacheRequest(request, query) {
    return buildLastFmDetailsCacheRequest(request, query, ["artist", "album"]);
  },
  buildEmptyPayload: buildEmptyLastFmAlbumDetailsPayload,
  fetchPayload({ apiKey, env, query, nowMs }) {
    return fetchLastFmAlbumDetails({
      apiKey,
      env,
      artist: query.artist,
      album: query.album,
      nowMs
    });
  },
  timeoutError: "Last.fm album details timed out",
  unavailableError: "Last.fm album details unavailable"
});
