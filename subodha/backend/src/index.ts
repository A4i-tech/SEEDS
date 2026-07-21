"use strict";
require("dotenv").config();
import { runSubodhaSync } from "./run";

const limit = process.env.SUBODHA_LIMIT ? parseInt(process.env.SUBODHA_LIMIT, 10) : Infinity;
const dryRun = process.env.SUBODHA_DRY_RUN === "true";

runSubodhaSync({ limit, dryRun })
  .then((summary) => {
    console.log("[subodha] Summary:", JSON.stringify(summary, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("[subodha] Fatal:", err);
    process.exit(1);
  });
