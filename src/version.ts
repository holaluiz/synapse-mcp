import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Package version, read from package.json so the server and CLI never drift from it */
export const VERSION: string = require("../package.json").version;
