import './style.css';
import { GoEngine } from './go/engine.js';
import { CanvasRenderer } from './go/canvas.js';
import { GoEditor } from './go/editor.js';

const app = document.querySelector('#app');
app.classList.add('go-app');

const canvas = document.createElement('canvas');
canvas.className = 'go-canvas';

const engine = new GoEngine(19, 6.5, true);
const renderer = new CanvasRenderer(canvas, engine);
const editor = new GoEditor(engine, renderer, app);

renderer.draw();

export { editor };
