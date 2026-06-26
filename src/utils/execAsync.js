import { spawn } from "child_process";

/**
 * Executes a shell command asynchronously using spawn, capturing output stream chunks.
 *
 * @param {string} command The shell command to run.
 * @param {Object} options Options for spawn.
 * @param {function} [onProgress] Callback returning line chunks of stdout/stderr as they arrive.
 * @returns {Promise<string>} The combined stdout of the command.
 */
export async function execAsync(command, options = {}, onProgress = null) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, { shell: true, ...options });

    let stdoutBuffer = "";
    let stderrBuffer = "";

    if (proc.stdout) {
      proc.stdout.on("data", (data) => {
        const text = data.toString();
        stdoutBuffer += text;
        if (onProgress) {
          const lines = text.trim().split("\n");
          const lastLine = lines[lines.length - 1].trim();
          if (lastLine) onProgress(lastLine);
        }
      });
    }

    if (proc.stderr) {
      proc.stderr.on("data", (data) => {
        const text = data.toString();
        stderrBuffer += text;
        if (onProgress) {
          const lines = text.trim().split("\n");
          const lastLine = lines[lines.length - 1].trim();
          if (lastLine) onProgress(lastLine);
        }
      });
    }

    proc.on("close", (code) => {
      if (code !== 0) {
        const err = new Error(`Command failed: ${command}\n${stderrBuffer}`);
        err.code = code;
        err.stdout = stdoutBuffer;
        err.stderr = stderrBuffer;
        reject(err);
      } else {
        resolve(stdoutBuffer.trim());
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}
