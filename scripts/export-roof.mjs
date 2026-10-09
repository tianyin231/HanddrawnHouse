import { readFileSync } from 'node:fs';
import { roofEnvelope, ROOF_PROPOSAL, ROOF_MATERIALS } from '../viewer/roof-concept.js';

// Blender 消费同一份几何，避免 Python 与浏览器各自计算屋脊和标高。
const parameters = JSON.parse(readFileSync(new URL('../house_parameters.json', import.meta.url), 'utf8'));
process.stdout.write(JSON.stringify({
  ...roofEnvelope(parameters), proposal: ROOF_PROPOSAL, materialDefinitions: ROOF_MATERIALS
}));
