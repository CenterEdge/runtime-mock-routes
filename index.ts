import { appFactory } from './src/app';
import { readJsonSync } from 'fs-extra';
import { join } from 'path'
const PORT = process.env.APP_PORT || 8000;
const jsonFilePath = process.env.REQUEST_JSON_PATH;


const initialRequests = jsonFilePath ? readJsonSync(join(process.cwd(), jsonFilePath)) : {};

const app = appFactory(initialRequests);

app.listen(PORT, () => {
    console.log(`⚡️[server]: Server is running at http://localhost:${PORT}`);
});