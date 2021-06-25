# Socket.IO Extended Redis Adapter

### `RandomNumberCollector.js`

```js
export class RandomNumberCollector extends RedisExtendedOperator {
    onRequest(request: OperatorRequest): any {
        request.response({randomNumber: Math.random()});
    }

    onEachResponse(request: OperatorRequest, response: OperatorResponse) {
        console.log("Received value:", response.randomNumber);
    }

    onAllResponses(request: OperatorRequest, responses: OperatorResponse[]): any {
        return responses.map(resp => resp.randomNumber);
    }

    request(): Promise<any> {
        return this.sendRequest({}, {});
    }
}
```

### `server.js`

```js
import {Server} from "socket.io";
import {createExtendedAdapter, RedisExtendedAdapter} from "socket.io-redis-ex";
import {RandomNumberCollector} from "./RandomNumberCollector";

var socketIoServer = new Server({
    adapter: createExtendedAdapter("redis://localhost:6379"),
});

socketIoServer.listen(3000);

RedisExtendedAdapter.of(socketIoServer).register(RandomNumberCollector);
```

### Usage `some-where.js`

```js
import {socketIoServer} from "./server";
import {RedisExtendedAdapter} from "socket.io-redis-ex";
import {RandomNumberCollector} from "./RandomNumberCollector";

async function someFunction() {
    const adapter = RedisExtendedAdapter.of(socketIoServer);
    const operator = adapter.operator(RandomNumberCollector);
    
    const values = await operator.request();
    console.log(values);

    /* Outputs:
        Received value: 0.9700694193466681
        Received value: 0.7476965655524968
        Received value: 0.3135955871890157
        [ 0.9700694193466681, 0.7476965655524968, 0.3135955871890157 ]
    */
}
```
