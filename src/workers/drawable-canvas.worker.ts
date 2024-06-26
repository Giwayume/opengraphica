import drawableClassMap from '@/canvas/drawables';

import type { Drawable, DrawableRenderMode } from '@/types';
import type {
    CreateCanvasRequest, AddDrawableRequest, RemoveDrawableRequest, DrawCanvasRequest,
    DrawQueueRequest, DrawCompleteResult, SetCanvasRenderScaleRequest, InitializedResult,
} from './drawable-canvas.types';

self.postMessage({ type: 'INITIALIZED' } as InitializedResult);

interface DrawableInfo {
    drawable: Drawable;
}

let renderMode: DrawableRenderMode = '2d'; // TODO - webgl
let renderScale = 1;
let drawX = 0;
let drawY = 0;
let currentBuffer = 1;
let canvas1: OffscreenCanvas;
let canvas2: OffscreenCanvas;
let isDrawingBuffer: { [key: number]: boolean } = {
    1: false,
    2: false,
}
let canvas1Ctx2d: OffscreenCanvasRenderingContext2D;
let canvas2Ctx2d: OffscreenCanvasRenderingContext2D;
const drawableMap = new Map<string, DrawableInfo>();

self.onmessage = ({ data }: { data: DrawQueueRequest }) => {
    if (data.type === 'CREATE_CANVAS') {
        createCanvas(data);
    } else if (data.type === 'SET_CANVAS_RENDER_SCALE') {
        setCanvasRenderScale(data);
    } else if (data.type === 'ADD_DRAWABLE') {
        addDrawable(data);
    } else if (data.type === 'REMOVE_DRAWABLE') {
        removeDrawable(data);
    } else if (data.type === 'DRAW_CANVAS') {
        drawCanvas(data);
    } else if (data.type === 'TERMINATE') {
        cleanup();
        self.close();
    }
};

function nearestPowerOf2(value: number) {
    return Math.ceil(Math.log(value) / Math.log(2));
}

function createCanvas(request: CreateCanvasRequest) {
    canvas1 = request.canvas1;
    canvas2 = request.canvas2;
    if (renderMode === '2d') {
        canvas1Ctx2d = canvas1.getContext('2d')!;
        canvas2Ctx2d = canvas2.getContext('2d')!;
    }
}

function setCanvasRenderScale(request: SetCanvasRenderScaleRequest) {
    renderScale = request.renderScale;
}

function addDrawable(request: AddDrawableRequest) {
    const { uuid, name, data } = request;
    const DrawableClass = drawableClassMap[name];
    drawableMap.set(uuid, {
        drawable: new DrawableClass({
            renderMode,
            scene: {} as any,
            data,
        }),
    });
}

function removeDrawable(request: RemoveDrawableRequest) {
    const drawableInfo = drawableMap.get(request.uuid);
    if (!drawableInfo) return;
    drawableInfo.drawable.dispose();
    drawableMap.delete(request.uuid);
}

function drawCanvas(request: DrawCanvasRequest) {
    const buffer = currentBuffer;
    if (isDrawingBuffer[buffer]) return;
    isDrawingBuffer[buffer] = true;
    const canvas = currentBuffer === 1 ? canvas1 : canvas2;
    const canvasCtx = currentBuffer === 1 ? canvas1Ctx2d : canvas2Ctx2d;
    currentBuffer = currentBuffer === 1 ? 2 : 1;

    const { updates: drawableUpdates, refresh } = request.options;

    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;

    for (const drawableUpdate of drawableUpdates) {
        const drawableInfo = drawableMap.get(drawableUpdate.uuid);
        if (!drawableInfo) continue;
        const drawingBounds = drawableInfo.drawable.update(drawableUpdate.data, { refresh });
        if (drawingBounds.left < left) left = drawingBounds.left;
        if (drawingBounds.right > right) right = drawingBounds.right;
        if (drawingBounds.top < top) top = drawingBounds.top;
        if (drawingBounds.bottom > bottom) bottom = drawingBounds.bottom;
    }

    drawX = left == Infinity ? 0 : Math.max(0, Math.floor(left * renderScale));
    drawY = top == Infinity ? 0 : Math.max(0, Math.floor(top * renderScale));

    const newCanvasWidth = Math.pow(2, nearestPowerOf2((right - left) * renderScale));
    const newCanvasHeight = Math.pow(2, nearestPowerOf2((bottom - top) * renderScale));
    if (newCanvasWidth && newCanvasHeight && (newCanvasWidth != canvas.width || newCanvasHeight != canvas.height)) {
        canvas.width = newCanvasWidth;
        canvas.height = newCanvasHeight;
    }

    if (renderMode === '2d') {
        draw2d(canvas, canvasCtx);
    }

    requestAnimationFrame(() => {
        isDrawingBuffer[buffer] = false;
        self.postMessage({
            type: 'DRAW_COMPLETE_RESULT',
            buffer,
            sourceX: drawX,
            sourceY: drawY,
        } as DrawCompleteResult);
    });
}

function draw2d(canvas: OffscreenCanvas, ctx: OffscreenCanvasRenderingContext2D) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(-drawX, -drawY);
    ctx.scale(renderScale, renderScale);
    for (const value of drawableMap.values()) {
        value.drawable.draw2d(ctx);
    }
    ctx.restore();
}

function cleanup() {
    for (const value of drawableMap.values()) {
        value.drawable.dispose();
    }
    drawableMap.clear();
}
