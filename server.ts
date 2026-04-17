import fs from 'fs';
import http from 'http';
import https from 'https';
import { Express } from 'express'
import { program } from 'commander';
import path, { resolve } from 'path';
import { appFactory as appFactoryV1 } from './src/app';
import { appFactory as appFactoryV2 } from './src/appV2';
import { NodeSDK } from '@opentelemetry/sdk-node';

export enum AppVersion {
    v1 = 'v1',
    v2 = 'v2'
}

const runServer = (sdk: NodeSDK) => {
    program.version("2.1.0")
        .option("-p, --port <port>", "Port to run the server one", process.env.RUNTIME_MOCK_ROUTES_PORT || "8080")
        .option("--https-port <httpsPort>", "Enable TLS for the server", process.env.RUNTIME_MOCK_ROUTES_HTTPS_PORT || "8443")
        .option("--tlsCert <tlsCertPath>", "Path to the TLS certificate file", process.env.HTTPS_CERT_FILE)
        .option("--tlsKey <tlsKeyPath>", "Path to the TLS key file", process.env.HTTPS_CERT_KEY_FILE)
        .option("-s, --seed <filePath>", "File path to seed the application", process.env.RUNTIME_MOCK_ROUTES_FILE_PATH)
        .option("-a, --appVersion <appVersion>", "App Version to use", AppVersion.v2)
        .option("-w, --watch", "Watch the seed file for changes and reload routes without restarting", false)

    program.parse(process.argv);

    const seedFilePath = program.seed ? resolve(program.seed) : null;

    // Tracks all files transitively required by the seed so we can bust & re-watch them
    let trackedDeps = new Set<string>();

    function loadSeed(filePath: string): any {

        // Bust cache for all previously tracked deps so we get fresh modules on reload
        for (const key of trackedDeps) {
            delete require.cache[key];
        }

        // Snapshot before requiring — anything new afterwards is a transitive dep
        const cacheBefore = new Set(Object.keys(require.cache));
        const funcOrJson = require(filePath);

        trackedDeps = new Set<string>();
        for (const key of Object.keys(require.cache)) {
            const normalizedKey = path.normalize(key);
            const segments = normalizedKey.split(path.sep);
            if (!cacheBefore.has(key) && !segments.includes('node_modules')) {
                trackedDeps.add(key);
            }
        }

        return typeof funcOrJson === 'function' ? funcOrJson() : funcOrJson;
    }

    let initialRequests: any = {};
    if (seedFilePath) {
        initialRequests = loadSeed(seedFilePath);
    }

    type AppFactory = (...args: any[]) => Express;

    const appVersions: Record<AppVersion, AppFactory> = {
        v1: appFactoryV1,
        v2: appFactoryV2
    }
    const appFactory = appVersions[program.appVersion] || appFactoryV2;

    // Use a mutable handler so the servers don't need to rebind ports on reload
    let currentApp = appFactory(initialRequests);
    const handler: http.RequestListener = (req, res) => currentApp(req, res);

    // Setup HTTPS options
    const httpsOptions = program.tlsCert && program.tlsKey && fs.existsSync(program.tlsCert) && fs.existsSync(program.tlsKey)
        ? {
            cert: fs.readFileSync(program.tlsCert),
            key: fs.readFileSync(program.tlsKey),
            enabled: true
        }
        : { enabled: false };

    const httpServer = http.createServer(handler);
    const httpsServer = httpsOptions.enabled ? https.createServer(httpsOptions, handler) : null;

    httpServer.listen(program.port, () => {
        console.log(`⚡️[server]: Server is running at http://localhost:${program.port}`);
    });
    if (httpsServer) {
    httpsServer.listen(program.httpsPort, () => {
        console.log(`⚡️[server]: Server is running at https://localhost:${program.httpsPort}`);
    });
    }

    // Watch seed and all transitive dependencies for changes
    if (program.watch && seedFilePath) {
        let watchDebounce: ReturnType<typeof setTimeout> | null = null;
        let depWatchers: fs.FSWatcher[] = [];

        function doReload() {
            watchDebounce = null;
            try {
                const newRequests = loadSeed(seedFilePath);
                currentApp = appFactory(newRequests);
                console.log(`🔥[watch]: Seed reloaded — watching ${trackedDeps.size} file(s)`);
                rewatchDeps();
            } catch (err) {
                console.error('🔥[watch]: Failed to reload seed:', err);
            }
        }

        function rewatchDeps() {
            for (const w of depWatchers) {
                w.close();
            }

            depWatchers = [];

            for (const dep of trackedDeps) {
                if (!fs.existsSync(dep)) {
                    continue;
                }

                try {
                    const w = fs.watch(dep, { persistent: true }, (eventType) => {
                        if (eventType !== 'change' && eventType !== 'rename') {
                            return;
                        }

                        if (watchDebounce) {
                            clearTimeout(watchDebounce);
                        }

                        watchDebounce = setTimeout(doReload, 100);
                    });
                    w.on('error', (err) => {
                        console.error(`🔥[watch]: Watcher error for ${dep}:`, err);
                    });
                    depWatchers.push(w);
                } catch {
                    // File may have been removed; skip
                }
            }
        }

        rewatchDeps();
        console.log(`🔥[watch]: Watching seed and ${trackedDeps.size} dep(s) — ${seedFilePath}`);
    }

    // Register signal handlers
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    // Graceful shutdown handler
    let isShuttingDown = false;
    async function gracefulShutdown(signal) {
        if (isShuttingDown) return;
        isShuttingDown = true;

        // Close servers
        const closePromises = [];
        closePromises.push(closeServer(httpServer));
        closePromises.push(closeServer(httpsServer));
        await Promise.all(closePromises);

        try {
            await sdk.shutdown();
        } catch (err) {
            console.log("Error shutting down OTEL SDK", err);
        }

        console.log('Shutdown complete, exiting process');
        process.exit(0);

        function closeServer(httpServer) {
            if (!httpServer) return Promise.resolve();
            const serverType = httpServer instanceof https.Server ? 'HTTPS' : 'HTTP'
            return new Promise<void>(resolve => {
                httpServer.close(() => {
                    resolve();
                });
                httpServer.closeAllConnections();
            });
        }
    }
}

export { runServer };