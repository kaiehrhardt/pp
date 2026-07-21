import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { logger } from "./logger";

let stdout: string[];
let stderr: string[];
let originalStdoutWrite: typeof process.stdout.write;
let originalStderrWrite: typeof process.stderr.write;
let originalNodeEnv: string | undefined;
let originalLogLevel: string | undefined;

beforeEach(() => {
  stdout = [];
  stderr = [];
  originalStdoutWrite = process.stdout.write.bind(process.stdout);
  originalStderrWrite = process.stderr.write.bind(process.stderr);
  originalNodeEnv = process.env.NODE_ENV;
  originalLogLevel = process.env.LOG_LEVEL;
  process.stdout.write = ((chunk: string) => {
    stdout.push(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string) => {
    stderr.push(chunk);
    return true;
  }) as typeof process.stderr.write;
});

afterEach(() => {
  process.stdout.write = originalStdoutWrite;
  process.stderr.write = originalStderrWrite;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalLogLevel === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = originalLogLevel;
});

describe("logger", () => {
  test("info goes to stdout, error goes to stderr", () => {
    logger.info("hello");
    logger.error("boom");
    expect(stdout).toHaveLength(1);
    expect(stderr).toHaveLength(1);
    expect(stdout[0]).toContain("hello");
    expect(stderr[0]).toContain("boom");
  });

  test("debug is filtered out at info threshold", () => {
    process.env.LOG_LEVEL = "info";
    logger.debug("noisy");
    logger.info("kept");
    expect(stdout).toHaveLength(1);
    expect(stdout[0]).toContain("kept");
  });

  test("defaults to info threshold in production, debug otherwise", () => {
    delete process.env.LOG_LEVEL;
    process.env.NODE_ENV = "production";
    logger.debug("noisy");
    expect(stdout).toHaveLength(0);

    process.env.NODE_ENV = "development";
    logger.debug("visible");
    expect(stdout).toHaveLength(1);
  });

  test("production mode emits structured JSON with bindings", () => {
    process.env.NODE_ENV = "production";
    delete process.env.LOG_LEVEL;
    logger.info("room created", { roomId: "abc123" });
    const entry = JSON.parse(stdout[0]!);
    expect(entry).toMatchObject({ level: "info", msg: "room created", roomId: "abc123" });
    expect(typeof entry.time).toBe("string");
  });

  test("error() serializes an Error passed as err", () => {
    process.env.NODE_ENV = "production";
    logger.error("db failed", { err: new Error("kaboom") });
    const entry = JSON.parse(stderr[0]!);
    expect(entry.err.message).toBe("kaboom");
    expect(entry.err.name).toBe("Error");
  });

  test("child() merges bindings into every call", () => {
    process.env.NODE_ENV = "production";
    const child = logger.child({ module: "store" });
    child.warn("careful", { roomId: "r1" });
    const entry = JSON.parse(stderr[0]!);
    expect(entry).toMatchObject({ module: "store", roomId: "r1", msg: "careful" });
  });
});
