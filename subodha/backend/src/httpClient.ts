"use strict";
import axios from "axios";
import http from "http";
import https from "https";

// Keep-alive agents: reuse TCP/TLS connections under concurrency.
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });

const client = axios.create({ httpAgent, httpsAgent });

export { client, httpAgent, httpsAgent };
