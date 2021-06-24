import {RedisAdapter, RedisAdapterOptions} from "socket.io-redis";
import {Adapter} from "socket.io-adapter";
import type {Server} from "socket.io";
import {debug as _debug} from "debug";
import type {OperatorParams, OperatorRequest, OperatorResponse, RedisExtendedOperator} from "./RedisExtendedOperator";
import uid2 from "uid2";

const debug = _debug("socket.io-redis-ex");

export function createExtendedAdapter(uri: string, opts?: Partial<RedisAdapterOptions>): any;
export function createExtendedAdapter(opts: Partial<RedisAdapterOptions>): any;

export function createExtendedAdapter(uri, opts = {}) {
    // handle options only
    if (typeof uri === "object") {
        opts = uri;
        uri = null;
    }
    return function (nsp) {
        return new RedisExtendedAdapter(nsp, uri, opts);
    };
}

export class RedisExtendedAdapter extends Adapter {
    readonly redisAdapter: RedisAdapter;

    readonly requestChannel: string;
    readonly responseChannel: string;
    readonly requestsTimeout: number;
    readonly channel: string;

    readonly requests = new Map<string, OperatorRequest>();
    readonly operations = new Map<typeof RedisExtendedOperator, RedisExtendedOperator>();

    constructor(nsp: any, uri: string, opts?: Partial<RedisAdapterOptions>) {
        super(nsp);
        this.requestsTimeout = opts?.requestsTimeout || 5000;
        const prefix = opts?.key || "socket.io";
        this.channel = prefix + "#" + nsp.name + "#";
        this.requestChannel = prefix + "-request#" + this.nsp.name + "#";
        this.responseChannel = prefix + "-response#" + this.nsp.name + "#";

        this.redisAdapter = new RedisAdapter(nsp, uri, opts);

        this.redisAdapter.on("error", error => this.emit("error", error));

        this.redisAdapter.subClient.on("messageBuffer", (channel, msg) => {
            channel = channel.toString();
            if (channel.startsWith(this.requestChannel)) {
                return this.onrequest(channel, msg);
            } else if (channel.startsWith(this.responseChannel)) {
                return this.onresponse(channel, msg);
            } else {
                return debug("ignore different channel");
            }
        });
    }

    static of(server: Server, nsp: string = "/"): RedisExtendedAdapter {
        // @ts-ignore
        return server.of(nsp).adapter as RedisExtendedAdapter;
    }

    register<T extends RedisExtendedOperator>(Ex: OperatorParams<T>) {
        if (this.operations.has(Ex)) {
            this.emit("error", new Error(`${Ex.name} already registered.`));
            return;
        }
        const ex1 = new Ex(this);
        this.operations.set(Ex, ex1);
    }

    operator<T extends RedisExtendedOperator>(Ex: OperatorParams<T>): T {
        // @ts-ignore
        return this.operations.get(Ex);
    }

    getNumSub() {
        if (this.redisAdapter.pubClient.constructor.name === "Cluster") {
            // Cluster
            const nodes = this.redisAdapter.pubClient.nodes();
            return Promise.all(nodes.map((node) => node.send_command("pubsub", ["numsub", this.requestChannel]))).then((values) => {
                let numSub = 0;
                values.map((value: any) => {
                    numSub += parseInt(value[1], 10);
                });
                return numSub;
            });
        } else {
            // RedisClient or Redis
            return new Promise((resolve, reject) => {
                this.redisAdapter.pubClient.send_command("pubsub", ["numsub", this.requestChannel], (err, numSub) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve(parseInt(numSub[1], 10));
                });
            });
        }
    }

    sendRequest(msger: RedisExtendedOperator, request: any, extra: any) {
        const requestId = uid2(6);
        const requestToBeSent = {
            requestId,
            type: msger.constructor.name,
            ...request,
        };
        return new Promise(async (resolve, reject) => {
            const timeout = setTimeout(() => {
                if (this.requests.has(requestId)) {
                    reject(new Error("timeout reached while waiting for sockets response"));
                    this.requests.delete(requestId);
                }
            }, this.requestsTimeout);

            const requestToBeStored = {
                ...requestToBeSent,
                msgCount: 0,
                numSub: await this.getNumSub(),
                responses: [],
                resolve: (value?: any) => {
                    clearTimeout(requestToBeSent.timeout);
                    resolve(value);
                    this.requests.delete(requestId);
                },
                timeout,
                ...extra,
            };
            this.requests.set(requestId, requestToBeStored);
            this.redisAdapter.pubClient.publish(this.requestChannel, JSON.stringify(requestToBeSent));
        });
    }

    sendResponse(response: any) {
        this.redisAdapter.pubClient.publish(this.responseChannel, response);
    }

    private createResponse(request: OperatorRequest, response: any) {
        return JSON.stringify({
            requestId: request.requestId,
            type: request.type,
            ...response,
        });
    }

    private onrequest(channel, msg) {
        let request: any;
        try {
            request = JSON.parse(msg);
        } catch (err) {
            this.emit("error", err);
            return;
        }

        for (let [Ex, ex] of this.operations) {
            if (Ex.name === request.type) {
                request.response = (response: any = {}) => {
                    const finalResponse = this.createResponse(request, response);
                    if (this.requests.has(request.requestId)) {
                        return this.onresponse(this.responseChannel, finalResponse);
                    } else {
                        return this.sendResponse(finalResponse);
                    }
                };
                ex.onRequest(request);
                break;
            }
        }
    }

    private async onresponse(channel, msg) {
        let response: OperatorResponse;
        try {
            response = JSON.parse(msg);
        } catch (err) {
            this.emit("error", err);
            return;
        }

        const request = this.requests.get(response.requestId);

        if (!request) {
            debug("Response for non-exists request!");
            return;
        }

        for (let [Ex, ex] of this.operations) {
            if (Ex.name === request.type) {
                request.msgCount++;
                request.responses.push(response);
                ex.onEachResponse(request, response);
                if (request.msgCount >= request.numSub) {
                    request.resolve(await ex.onAllResponses(request, request.responses));
                }
                break;
            }
        }
    }
}
