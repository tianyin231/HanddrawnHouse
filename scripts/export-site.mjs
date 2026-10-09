import {readFileSync} from 'node:fs';
import {siteLayout} from '../viewer/site-layout.js';
const read=name=>JSON.parse(readFileSync(new URL('../'+name,import.meta.url),'utf8'));
process.stdout.write(JSON.stringify(siteLayout(read('house_parameters.json'),read('plan_floor_1.json'))));
