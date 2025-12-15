#!/usr/bin/env node
import { NodeSDK, logs } from '@opentelemetry/sdk-node';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';

let logRecordProcessors: logs.LogRecordProcessor[] | undefined = undefined;
if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  // OTLP isn't configured, fallback to console logging
  logRecordProcessors = [new logs.SimpleLogRecordProcessor(new logs.ConsoleLogRecordExporter())];
}

const sdk = new NodeSDK({
  logRecordProcessors: logRecordProcessors,
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation()
  ],
});

sdk.start()

// Delay import so we register the OTEL SDK before loading modules like http/express
require("./server").runServer(sdk);