import DockerComposeService from "./DockerComposeService.ts";
import LandoService from "./LandoService.ts";
import type EnvironmentService from "./EnvironmentService.ts";

type EnvironmentFactory = () => EnvironmentService;

const adapters = new Map<string, EnvironmentFactory>([
  ["docker", () => new DockerComposeService()],
  ["lando", () => new LandoService()],
]);

export function registerEnvironmentAdapter(name: string, factory: EnvironmentFactory): void {
  if (!name || typeof factory !== "function") throw new Error("Environment adapters require a name and factory.");
  adapters.set(name, factory);
}

export function listEnvironmentAdapters(): string[] { return [...adapters.keys()]; }

export function resolveEnvironmentService(environment: string): EnvironmentService {
  const factory = adapters.get(environment);
  if (!factory) throw new Error(`Unknown local environment "${environment}". Available: ${listEnvironmentAdapters().join(", ")}.`);
  return factory();
}
