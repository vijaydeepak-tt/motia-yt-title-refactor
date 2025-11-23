import { CronConfig } from "motia";

export const config: CronConfig = {
  name: "DailyAutomation",
  type: "cron",
  cron: "0 0 * * *",
  emits: [],
};

export const handler = async ({ logger }: any) => {
  logger.info("Running daily automation");

  const response = await fetch("/submit", {
    method: "POST",
    body: JSON.stringify({
      channel: "UC_x5XG5X64DTvfQ5gp4hEHw",
      email: "yimer70406@gamepec.com",
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to submit channel");
  }
};
