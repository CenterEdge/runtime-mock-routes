# Runtime-Mock-Routes

Runtime-Mock-Routes is a nodejs application for defining parameterized route and response bodies. This is ideal for mocking 3rd party services.

## Installation

Use the package manager [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/) to install Runtime-Mock-Routes.

```bash
npm install -g runtime-mock-routes
```

## Usage

```bash
runtime-mock-routes -p 8080 -s ./seed.json
```

All command line options are optional. If a seed json file is specified, it must match the `RuntimeRequestCollection` interface.

```typescript
interface RuntimeRequestBody {
    path: string;
    body: any;
    status?: number;
}

interface RuntimeRequestCollection {
    [path: string]: RuntimeRequestBody
}
```

The following environment variables can also be used in place of command line options

```
RUNTIME_MOCK_ROUTES_PORT=8080
RUNTIME_MOCK_ROUTES_FILE_PATH=/seed.json
```

Route parameters are specified in path via a colon followed by the parameter name.
`'/users/:id'`

Template strings that are compatible with [handlebars](https://handlebarsjs.com/) can be used for the `body` property of a `RuntimeRequestBody`. The application will use path and query params as data for the tempalte. This application makes use of [faker](https://www.npmjs.com/package/faker) and [chance](https://www.npmjs.com/package/chance) as Handlebars Helpers.

```
{{params.<path-param-name>}} {{query.<query-param-name>}} 
{{body.<post-body-property>}}
{{ faker "lorem.words" 5}} {{ chance "guid"}}
```

If the rendered template is valid JSON, the response will be of type `application/json`.

### Routes
* `GET /` returns all of the currently defined routes 
* `POST /` Takes a `RuntimeRequestBody` and adds it to the collection or updates the existing entry if it exists.
* `GET /*` The result of retrieving an entry in the collection, 404 otherwise
* `POST /*` The result of retrieving an entry in the collection, 404 otherwise
* `DELETE /?path=<path>` Deletes items from the collection

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to add/update tests as appropriate.

## License
[MIT](https://choosealicense.com/licenses/mit/)