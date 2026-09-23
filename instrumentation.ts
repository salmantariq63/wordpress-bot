export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootstrapServerData } = await import("@/lib/server-bootstrap");
    await bootstrapServerData();
  }
}
