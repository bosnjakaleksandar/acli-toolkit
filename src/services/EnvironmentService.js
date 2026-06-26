export default class EnvironmentService {
  async scaffold(targetDir, type, options, spinner = null) {
    throw new Error("scaffold() not implemented");
  }

  async start(targetDir, spinner = null) {
    throw new Error("start() not implemented");
  }

  async importDb(targetDir, sqlFile, spinner = null) {
    throw new Error("importDb() not implemented");
  }

  async searchReplace(targetDir, from, to, spinner = null) {
    throw new Error("searchReplace() not implemented");
  }

  async runWpCommand(targetDir, command, spinner = null) {
    throw new Error("runWpCommand() not implemented");
  }

  async isDbReady(targetDir) {
    throw new Error("isDbReady() not implemented");
  }
}
