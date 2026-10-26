import { existsSync } from "node:fs";

// Container and CI installs do not need local Git hooks or Husky's dev dependency.
if (
  process.env.HUSKY === "0" ||
  process.env.CI ||
  process.env.NODE_ENV === "production" ||
  !existsSync(".git")
) {
  process.exit(0);
}

const { default: husky } = await import("husky");
const error = husky();
if (error) {
  console.error(error);
  process.exit(1);
}
