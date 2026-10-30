/** Console output for pipeline steps. Kept tiny so every command reports the same way. */

export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliError";
  }
}

export type Reporter = {
  /** Runs one numbered step, printing its name before and its time after. */
  step<T>(name: string, run: () => Promise<T> | T): Promise<T>;
  /** An indented detail line under the current step. */
  info(message: string): void;
};

const elapsed = (start: number): string => {
  const ms = Date.now() - start;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
};

export const createReporter = (
  total: number,
  log: (line: string) => void = console.log,
): Reporter => {
  let index = 0;
  return {
    async step(name, run) {
      index += 1;
      const prefix = total > 1 ? `[${index}/${total}] ` : "";
      log(`\n${prefix}${name}`);
      const start = Date.now();
      try {
        const result = await run();
        log(`  done in ${elapsed(start)}`);
        return result;
      } catch (err) {
        log(`  failed after ${elapsed(start)}`);
        throw err;
      }
    },
    info(message) {
      log(`  ${message}`);
    },
  };
};
