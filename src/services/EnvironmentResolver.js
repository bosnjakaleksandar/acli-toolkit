import DockerComposeService from "./DockerComposeService.js";
import LandoService from "./LandoService.js";

/**
 * Creates the correct local environment service for a context.
 *
 * @param {string} environment Environment key.
 * @returns {DockerComposeService | LandoService}
 */
export function resolveEnvironmentService(environment) {
  return environment === "lando" ? new LandoService() : new DockerComposeService();
}
