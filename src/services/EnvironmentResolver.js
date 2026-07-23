import DockerComposeService from "./DockerComposeService.js";
import LandoService from "./LandoService.js";

const adapters = new Map([
  ["docker", () => new DockerComposeService()],
  ["lando", () => new LandoService()],
]);

export function registerEnvironmentAdapter(name, factory) {
  if (!name || typeof factory !== "function") throw new Error("Environment adapters require a name and factory.");
  adapters.set(name, factory);
}

export function listEnvironmentAdapters() { return [...adapters.keys()]; }

export function resolveEnvironmentService(environment) {
  const factory = adapters.get(environment);
  if (!factory) throw new Error(`Unknown local environment "${environment}". Available: ${listEnvironmentAdapters().join(", ")}.`);
  return factory();
}
