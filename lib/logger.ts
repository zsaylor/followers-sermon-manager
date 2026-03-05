// Safe error logger for Bun/vercel dev compatibility
export function safeLog(label: string, ...args: any[]) {
  const timestamp = new Date().toISOString();
  const message = args
    .map((arg) => {
      if (arg === null) return "null";
      if (arg === undefined) return "undefined";
      // Handle Buffer objects explicitly
      if (Buffer.isBuffer(arg)) {
        return arg.toString("utf8");
      }
      if (typeof arg === "object") {
        try {
          // Avoid circular references and use simple stringification
          const seen = new Set();
          return JSON.stringify(
            arg,
            (key, value) => {
              if (typeof value === "object" && value !== null) {
                if (seen.has(value)) return "[Circular]";
                seen.add(value);
              }
              return value;
            },
            2,
          );
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(" ");

  console.log(`[${timestamp}] ${label}: ${message}`);
}

export function safeError(label: string, error: any) {
  const timestamp = new Date().toISOString();
  let errorStr = "";

  try {
    if (error === null) errorStr = "null";
    else if (error === undefined) errorStr = "undefined";
    // Handle Buffer objects explicitly
    else if (Buffer.isBuffer(error)) {
      errorStr = error.toString("utf8");
    } else if (typeof error === "object") {
      const parts: string[] = [];
      if (error.name) parts.push(`Name: ${error.name}`);
      if (error.code) parts.push(`Code: ${error.code}`);
      if (error.message) parts.push(`Message: ${error.message}`);
      if (error.statusCode) parts.push(`Status: ${error.statusCode}`);
      if (error.requestId) parts.push(`RequestId: ${error.requestId}`);
      if (error.stack) {
        const stackLines = error.stack.split("\n").slice(0, 5);
        parts.push(`Stack: ${stackLines.join(" | ")}`);
      }
      errorStr = parts.join(" | ");
    } else {
      errorStr = String(error);
    }
  } catch (e) {
    errorStr = `Failed to stringify error: ${String(error)}`;
  }

  // Many dev runners render stderr as raw Buffers; keep errors human-readable.
  console.log(`[${timestamp}] ${label} ERROR: ${errorStr}`);
}
