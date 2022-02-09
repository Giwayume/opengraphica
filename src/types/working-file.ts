import { CanvasRenderingContext2DEnhanced } from './canvas';
import { ColorModel } from './color';
import { VectorShape } from './vector';

export type WorkingFileLayerBlendingMode = 'color' | 'color-burn' | 'color-dodge' | 'copy' | 
    'darken' | 'darker' | 'destination-atop' | 'destination-in' | 'destination-out' | 'destination-over' | 
    'difference' | 'exclusion' | 'hard-light' | 'hue' | 'lighten' | 'lighter' | 'luminosity' | 
    'multiply' | 'overlay' | 'saturation' | 'screen' | 'soft-light' | 'source-atop' | 'source-in' | 
    'source-out' | 'source-over' | 'xor';
export type WorkingFileLayerType = 'group' | 'raster' | 'rasterSequence' | 'vector' | 'text';

export interface WorkingFileLayerFilter<T extends ColorModel> {
    name: string;
}

export interface WorkingFileLayerRenderer<T extends ColorModel> {
    draw(ctx: CanvasRenderingContext2DEnhanced, layer: WorkingFileLayer<T>): void;
}

export interface WorkingFileTimelineKey {
    timing: number[]; // Cubic beizer, array of 4
    value: any;
}

export interface WorkingFileLayerTimelineFrame {
    layerId: number;
    start: number; // Milliseconds
    end: number | null; // Milliseconds
    keys: {
        [key: string]: WorkingFileTimelineKey;
    };
}

export type WorkingFileTimelineTrack = WorkingFileLayerTimelineFrame[];

export interface WorkingFileTimeline {
    id: number;
    name: string;
    start: number;
    end: number;
    tracks: {
        [key: string]: WorkingFileTimelineTrack; // Mapping of layer id to frame list
    }
}

export interface WorkingFileLayer<T extends ColorModel> {
    bakedImage: HTMLImageElement | null;
    blendingMode: WorkingFileLayerBlendingMode;
    filters: WorkingFileLayerFilter<T>[];
    groupId: number | null;
    height: number;
    id: number;
    name: string;
    opacity: 1;
    renderer: WorkingFileLayerRenderer<T>;
    thumbnailImageSrc: string | null;
    transform: DOMMatrix;
    type: WorkingFileLayerType;
    visible: boolean;
    width: number;
}

export interface WorkingFileGroupLayer<T extends ColorModel> extends WorkingFileLayer<T> {
    type: 'group';
    expanded: boolean;
    layers: WorkingFileLayer<T>[];
}

export interface WorkingFileRasterLayer<T extends ColorModel> extends WorkingFileLayer<T> {
    type: 'raster';
    data: {
        sourceImage?: HTMLImageElement;
        sourceImageIsObjectUrl?: boolean;
        draftImage?: HTMLCanvasElement;
    }
}

export interface WorkingFileRasterSequenceLayerFrame<T extends ColorModel> {
    start: number; // Milliseconds
    end: number; // Milliseconds
    image: WorkingFileRasterLayer<T>['data'];
    thumbnailImageSrc: string | null;
}

export interface WorkingFileRasterSequenceLayer<T extends ColorModel> extends WorkingFileLayer<T> {
    type: 'rasterSequence';
    data: {
        currentFrame?: WorkingFileRasterLayer<T>['data'];
        sequence: WorkingFileRasterSequenceLayerFrame<T>[];
    };
}

export interface WorkingFileVectorLayer<T extends ColorModel> extends WorkingFileLayer<T> {
    type: 'vector';
    data: VectorShape<T>[];
}

export interface WorkingFileTextLayerSpanMeta<T extends ColorModel> {
    family?: string;
    size?: number;
    weight?: number;
    style?: 'normal' | 'italic' | 'oblique';
    obliqueAngle?: number;
    underline?: null | 'solid' | 'wavy' | 'dashed';
    underlineColor?: null | T;
    underlineThickness?: number;
    overline?: null | 'solid' | 'wavy' | 'dashed';
    overlineColor?: null | T;
    overlineThickness?: number;
    strikethrough?: null | 'solid' | 'wavy' | 'dashed';
    strikethroughColor?: null | T;
    strikethroughThickness?: number;
    fillColor?: T;
    strokeColor?: T;
    strokeSize?: number;
    tracking?: number;
    leading?: number;
}

export interface WorkingFileTextLayerSpan<T extends ColorModel> {
    text: string;
    meta: WorkingFileTextLayerSpanMeta<T>;
}

export interface WorkingFileTextLayerLine<T extends ColorModel> {
    align: 'start' | 'center' | 'end';
    spans: WorkingFileTextLayerSpan<T>[];
}

export interface WorkingFileTextLayer<T extends ColorModel> extends WorkingFileLayer<T> {
    type: 'text';
    data: {
        boundary: 'dynamic' | 'box';
        kerning: 'metrics' | 'none';
        textDirection: 'ltr' | 'rtl' | 'ttb' | 'btt';
        wrapDirection: 'ltr' | 'rtl' | 'ttb' | 'btt';
        wrapDirectionAlign: 'start' | 'center' | 'end';
        wrapAt: 'word' | 'wordThenLetter';
        lines: WorkingFileTextLayerLine<T>[];
    }
}

export type WorkingFileAnyLayer<T extends ColorModel> = WorkingFileGroupLayer<T> | WorkingFileRasterLayer<T> | WorkingFileRasterSequenceLayer<T> | WorkingFileVectorLayer<T> | WorkingFileTextLayer<T>;

export interface InsertGroupLayerOptions<T extends ColorModel> extends Partial<WorkingFileGroupLayer<T>> {
    type: 'group';
}
export interface InsertRasterLayerOptions<T extends ColorModel> extends Partial<WorkingFileRasterLayer<T>> {
    type: 'raster';
}
export interface InsertRasterSequenceLayerOptions<T extends ColorModel> extends Partial<WorkingFileRasterSequenceLayer<T>> {
    type: 'rasterSequence';
}
export interface InsertVectorLayerOptions<T extends ColorModel> extends Partial<WorkingFileVectorLayer<T>> {
    type: 'vector';
}
export interface InsertTextLayerOptions<T extends ColorModel> extends Partial<WorkingFileTextLayer<T>> {
    type: 'text';
}
export type InsertAnyLayerOptions<T extends ColorModel> = InsertGroupLayerOptions<T> | InsertRasterLayerOptions<T> | InsertRasterSequenceLayerOptions<T> | InsertVectorLayerOptions<T> | InsertTextLayerOptions<T>;

export interface UpdateGroupLayerOptions<T extends ColorModel> extends Partial<WorkingFileGroupLayer<T>> {
    id: number;
}
export interface UpdateRasterLayerOptions<T extends ColorModel> extends Partial<WorkingFileRasterLayer<T>> {
    id: number;
}
export interface UpdateRasterSequenceLayerOptions<T extends ColorModel> extends Partial<WorkingFileRasterSequenceLayer<T>> {
    id: number;
}
export interface UpdateVectorLayerOptions<T extends ColorModel> extends Partial<WorkingFileVectorLayer<T>> {
    id: number;
}
export interface UpdateTextLayerOptions<T extends ColorModel> extends Partial<WorkingFileTextLayer<T>> {
    id: number;
}
export type UpdateAnyLayerOptions<T extends ColorModel> = UpdateGroupLayerOptions<T> | UpdateRasterLayerOptions<T> | UpdateRasterSequenceLayerOptions<T> | UpdateVectorLayerOptions<T> | UpdateTextLayerOptions<T>;

export interface NewFilePreset {
    name: string,
    width: number,
    height: number,
    measuringUnits: 'px' | 'cm' | 'mm' | 'in',
    resolutionX: number,
    resolutionY: number,
    resolutionUnits: 'px/in' | 'px/mm' | 'px/cm',
    colorProfile: string,
    scaleFactor: 1
}
