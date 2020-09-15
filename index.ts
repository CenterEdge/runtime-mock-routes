#!/usr/bin/env node
import { program } from 'commander';
import { resolve } from 'path';
import { appFactory, MethodBasedRuntimeRequestCollection } from './src/app';


program.version("1.0.1")
    .option("-p, --port <port>", "Port to run the server one", process.env.RUNTIME_MOCK_ROUTES_PORT || "8080")
    .option("-s, --seed <filePath>", "File path to seed the application", process.env.RUNTIME_MOCK_ROUTES_FILE_PATH)

program.parse(process.argv);
let initialRequests: MethodBasedRuntimeRequestCollection = {};
if (program.seed) {
    const filePath = resolve(program.seed);
    const funcOrJson = require(filePath);
    initialRequests = typeof funcOrJson === 'function' ? funcOrJson() : funcOrJson;
}

const app = appFactory(initialRequests);

app.listen(program.port, () => {
    console.log(`⚡️[server]: Server is running at http://localhost:${program.port}`);
});