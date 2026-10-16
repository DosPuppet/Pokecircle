import { rmSync } from "node:fs";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      // Vitest 5.0.1 does not delete the temporary directory of its main instance (`/tmp/<nanoid>/ssr`, about 60 MB
      // per run): hundreds of runs filled up `/tmp` on 2026-10-02. It is deleted on close.
      name: "pocketmate-clear-vitest-tmp",
      configureVitest({ vitest }) {
        const dir = (vitest as unknown as { _tmpDir?: string })._tmpDir;
        if (!dir) return;
        const clear = () => rmSync(dir, { recursive: true, force: true });
        vitest.onClose(clear);
        process.once("exit", clear);
      },
    },
  ],
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    // `verify --set <EXT>`: the card smoke tests of the other sets are skipped (PM_SKIP, comma-separated files); CI
    // and `verify --full` run them all.
    exclude: [...configDefaults.exclude, ...(process.env.PM_SKIP?.split(",").filter(Boolean) ?? [])],
    // Workers reused across test files (cards and engine loaded once per worker, not once per file).
    // Tests must not leave shared module state changed (a stubbed global is restored in afterEach).
    isolate: false,
  },
});
