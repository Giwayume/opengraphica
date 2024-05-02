import type { Scene } from 'three/src/scenes/Scene';

export type DrawableRenderMode = '2d' | 'webgl';

export interface DefaultDrawableData {
    [key: string]: any;
}

export interface DrawableOptionsGeneral<T = DefaultDrawableData> {
    renderMode: DrawableRenderMode;
    data?: T;
}

export interface DrawableOptions2d<T = DefaultDrawableData> extends DrawableOptionsGeneral<T> {
    renderMode: '2d';
}

export interface DrawableOptionsWebgl<T = DefaultDrawableData> extends DrawableOptionsGeneral<T> {
    renderMode: 'webgl';
    scene: Scene;
}

export interface DrawableUpdate<T = DefaultDrawableData> {
    uuid: string;
    data: T;
}

export type DrawableOptions<T = DefaultDrawableData> = DrawableOptions2d<T> | DrawableOptionsWebgl<T>;

export interface Drawable<T = DefaultDrawableData> {
    update: (data: T) => void;
    draw2d: (context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => void;
    drawWebgl: () => void;
    dispose: () => void;
}
export interface DrawableConstructor {
    new (options: DrawableOptions): Drawable;
}

export interface DrawableCanvasOptions {
    updateChunkSize?: number;
}
