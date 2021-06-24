import {Server} from "socket.io";
import {createExtendedAdapter, RedisExtendedAdapter} from "../src/RedisExtendedAdapter";
import {OperatorRequest, OperatorResponse, RedisExtendedOperator} from "../src/RedisExtendedOperator";

class MyOperator extends RedisExtendedOperator {
    onRequest(request: OperatorRequest): any {
        request.response({random: Math.random()});
    }

    onEachResponse(request: OperatorRequest, response: OperatorResponse) {
        console.log(response.random);
    }

    onAllResponses(request: OperatorRequest, responses: OperatorResponse[]): any {
        return responses.map(resp => resp.random);
    }

    request(): Promise<any> {
        return this.sendRequest({}, {});
    }
}

const server1 = new Server({adapter: createExtendedAdapter("redis://localhost:6066")});
const server2 = new Server({adapter: createExtendedAdapter("redis://localhost:6066")});
const server3 = new Server({adapter: createExtendedAdapter("redis://localhost:6066")});

RedisExtendedAdapter.of(server1).register(MyOperator);
RedisExtendedAdapter.of(server2).register(MyOperator);
RedisExtendedAdapter.of(server3).register(MyOperator);

setTimeout(async () => {
    console.log(await RedisExtendedAdapter.of(server1).operator(MyOperator).request());

    process.exit(0);
}, 1000);
