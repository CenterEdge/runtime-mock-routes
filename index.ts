#!/usr/bin/env node
import { program } from 'commander';
import { readJsonSync } from 'fs-extra';
import { resolve } from 'path';
import { appFactory, RuntimeRequestCollection } from './src/app';


program.version("1.0.0")
    .option("-p, --port <port>", "Port to run the server one", process.env.RUNTIME_MOCK_ROUTES_PORT || "8080")
    .option("-s, --seed <filePath>", "File path to seed the application", process.env.RUNTIME_MOCK_ROUTES_FILE_PATH)

program.parse(process.argv);
let initialRequests: RuntimeRequestCollection = {};
if (program.seed) {
    initialRequests = readJsonSync(resolve(program.seed))
}

const app = appFactory(initialRequests);

app.listen(program.port, () => {
    console.log(`⚡️[server]: Server is running at http://localhost:${program.port}`);
});