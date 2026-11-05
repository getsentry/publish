const core = require("@actions/core");

const GITHUB_STATUS_INCIDENTS_URL =
  "https://www.githubstatus.com/api/v2/incidents.json";

// The failure comment waits for this read, so a slow status page must not
// hold it.
const GITHUB_STATUS_TIMEOUT_MS = 5000;

/**
 * Lists githubstatus.com incidents that are open, or that were resolved at or
 * after `since`. These are the incidents that could have affected a workflow
 * run that started at `since`.
 *
 * Fails open: a status page problem must not block the publish result
 * comment, so any error logs a warning and returns an empty list.
 *
 * @param {Date} since Start of the time window
 * @returns {Promise<Array<{name: string, status: string, components: string[], url: string, startedAt: string, resolvedAt: (string|null)}>>}
 */
async function loadGitHubIncidents(since) {
  try {
    // githubstatus.com is public and takes no GitHub credential.
    const response = await fetch(GITHUB_STATUS_INCIDENTS_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(GITHUB_STATUS_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`githubstatus.com returned HTTP ${response.status}`);
    }
    const { incidents } = await response.json();
    if (!Array.isArray(incidents)) {
      throw new Error("githubstatus.com response has no incidents list");
    }
    return incidents
      .filter(
        (incident) =>
          !incident.resolved_at ||
          Date.parse(incident.resolved_at) >= since.getTime()
      )
      .map((incident) => ({
        // A line break in the name would break the Markdown list item.
        name: String(incident.name).replace(/\s+/g, " "),
        status: incident.status,
        components: (incident.components || []).map(
          (component) => component.name
        ),
        url: incident.shortlink,
        startedAt: incident.started_at || incident.created_at,
        resolvedAt: incident.resolved_at || null,
      }));
  } catch (error) {
    core.warning(`Could not read GitHub status incidents: ${error.message}`);
    return [];
  }
}

module.exports = {
  loadGitHubIncidents,
};
