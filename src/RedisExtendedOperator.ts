import type {RedisExtendedAdapter} from "./RedisExtendedAdapter";

export type OperatorParams<T extends RedisExtendedOperator> = {
    new(RedisExtendedAdapter): T;
};

export type OperatorResponse = {
    requestId: string;
    type: string;
    [p: string]: any;
};

export type OperatorRequest = {
    requestId: string;
    type: string;
    resolve: (value?: any) => void;
    response: (response?: any) => void;
    timeout: any;
    msgCount: number;
    numSub: number;
    responses: any[];
    [p: string]: any;
};

export abstract class RedisExtendedOperator {
    constructor(public adapter: RedisExtendedAdapter) {
    }

    abstract onRequest(request: OperatorRequest);

    abstract onEachResponse(request: OperatorRequest, response: OperatorResponse);

    abstract onAllResponses(request: OperatorRequest, responses: OperatorResponse[]);

    abstract request(): void;

    protected async sendRequest(toBeSent: any = {}, toBeStored: any = {}) {
        return await this.adapter.sendRequest(this, toBeSent, toBeStored);
    }
}
