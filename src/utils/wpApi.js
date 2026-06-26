/**
 * Creates a new 'project' post on a remote WordPress site (Knowledge Base).
 *
 * @param {Object} options
 * @param {string} options.wpSiteUrl - Base URL of the remote WP site (e.g. 'https://admin.yourdomain.com')
 * @param {string} options.projectName - The name of the generated project
 * @param {string} options.repoUrl - The Git repository URL
 * @param {string} options.stagingUrl - The Staging URL of the new project
 * @param {string} options.developerName - The developer who created the project
 * @param {string} [options.basicAuthUser] - HTTP Basic Auth username (optional)
 * @param {string} [options.basicAuthPass] - HTTP Basic Auth password (optional)
 * @returns {Promise<Object>} The created WordPress post data
 */
export async function createProjectPost({
  wpSiteUrl,
  developerName,
  projectName,
  repoUrl,
  stagingUrl,
  basicAuthUser,
  basicAuthPass,
}) {
  const apiUrl = `${wpSiteUrl.replace(/\/$/, "")}/wp-json/baza-znanja/v1/projects`;

  const headers = {
    "Content-Type": "application/json",
  };

  if (basicAuthUser && basicAuthPass) {
    const encodedCredentials = Buffer.from(
      `${basicAuthUser}:${basicAuthPass}`,
    ).toString("base64");
    headers["Authorization"] = `Basic ${encodedCredentials}`;
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: headers,
    body: JSON.stringify({
      title: projectName,
      status: "publish",
      acf: {
        developer: developerName,
        repo_url: repoUrl,
        staging_url: stagingUrl,
      },
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `HTTP ${response.status}: ${errorData.message || response.statusText}`,
    );
  }

  return await response.json();
}
