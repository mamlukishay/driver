import { errorText, he, type ClientErrorCode } from "../i18n/he.ts";

export function Loading() {
  return (
    <div class="skel" role="status" aria-label={he.common.loading}>
      <i style={{ width: "70%" }} />
      <i style={{ width: "45%" }} />
      <i style={{ width: "85%" }} />
    </div>
  );
}

export function ErrorState({ code, onRetry }: { code: ClientErrorCode; onRetry?: () => void }) {
  return (
    <div class="note gap" role="alert">
      <p>{errorText(code)}</p>
      {onRetry && code !== "not_found" && (
        <button type="button" class="mini" onClick={onRetry}>
          {he.common.retry}
        </button>
      )}
      {code === "not_found" && (
        <a class="mini" href="/">
          {he.notFound.home}
        </a>
      )}
    </div>
  );
}
