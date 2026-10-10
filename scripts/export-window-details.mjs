import {readFileSync} from 'node:fs';
import {windowDetails} from '../viewer/window-details.js';
const read=name=>JSON.parse(readFileSync(new URL(`../${name}`,import.meta.url),'utf8'));
process.stdout.write(JSON.stringify(windowDetails(read('house_parameters.json'),read(`plan_floor_${Number(process.argv[2])}.json`))));
