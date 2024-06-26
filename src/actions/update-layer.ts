import {
    ColorModel, WorkingFileAnyLayer,
    UpdateAnyLayerOptions, UpdateRasterLayerOptions, WorkingFileRasterLayer, WorkingFileLayerDraftChunk
} from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { markRaw } from 'vue';
import { BaseAction } from './base';
import { createEmptyCanvasWith2dContext } from '@/lib/image';
import { drawImageToCanvas2d } from '@/lib/canvas';
import canvasStore from '@/store/canvas';
import { prepareStoredImageForEditing, reserveStoredImage, unreserveStoredImage } from '@/store/image';
import workingFileStore, { getLayerById, regenerateLayerThumbnail, getCanvasRenderingContext2DSettings } from '@/store/working-file';
import { updateBakedImageForLayer } from './baking';
import layerRenderers from '@/canvas/renderers';

export class UpdateLayerAction<LayerOptions extends UpdateAnyLayerOptions<ColorModel>> extends BaseAction {

    private updateLayerOptions!: LayerOptions;
    private previousProps: Partial<WorkingFileAnyLayer<ColorModel>> = {};
    private explicitPreviousProps: Partial<WorkingFileAnyLayer<ColorModel>> = {};

    private oldRasterSourceImageId: string | null = null;
    private oldRasterUpdateChunks: WorkingFileLayerDraftChunk[] = [];
    private newRasterUpdateChunks: WorkingFileLayerDraftChunk[] = [];

    constructor(updateLayerOptions: LayerOptions, explicitPreviousProps: Partial<WorkingFileAnyLayer<ColorModel>> = {}) {
        super('updateLayer', 'action.updateLayer');
        this.updateLayerOptions = updateLayerOptions;
        this.explicitPreviousProps = explicitPreviousProps;
	}

	public async do() {
        super.do();

        let requiresBaking: boolean = false;

        const layers = workingFileStore.get('layers');
        const layer = getLayerById(this.updateLayerOptions.id, layers);
        if (!layer) {
            throw new Error('Aborted - Layer with specified id not found.');
        }

        const renderer = canvasStore.get('renderer');

        const layerUpdateProps = Object.keys(this.updateLayerOptions).sort((aKey, bKey) => {
            if (aKey === 'type' && bKey !== 'type') return -1;
            if (aKey !== 'type' && bKey === 'type') return 1;
            if (aKey === 'draft' && bKey !== 'draft') return 1;
            if (aKey !== 'draft' && bKey === 'draft') return -1;
            return 0;
        }) as Array<keyof LayerOptions>;
        for (let prop of layerUpdateProps) {
            if (prop === 'data') {
                if (layer.type === 'raster') {
                    if (!layer.data) {
                        layer.data = { sourceUuid: '' };
                    }
                    const newData = this.updateLayerOptions[prop] as UpdateRasterLayerOptions<ColorModel>['data'];
                    const newSourceUuid = newData?.sourceUuid ?? '';
                    const oldSourceUuid = layer.data.sourceUuid ?? '';
                    if (newSourceUuid && newSourceUuid !== oldSourceUuid) {
                        layer.data.sourceUuid = newSourceUuid;
                        this.oldRasterSourceImageId = oldSourceUuid;
                        reserveStoredImage(newSourceUuid, `${layer.id}`);
                        requiresBaking = true;
                    }
                    updateSourceImageWithChunks:
                    if (newData?.updateChunks) {
                        const sourceCanvas = await prepareStoredImageForEditing(layer.data.sourceUuid);
                        if (!sourceCanvas) break updateSourceImageWithChunks;
                        const sourceCtx = sourceCanvas.getContext('2d', getCanvasRenderingContext2DSettings());
                        if (!sourceCtx) break updateSourceImageWithChunks;
                        this.newRasterUpdateChunks = newData.updateChunks;
                        if (this.oldRasterUpdateChunks.length != this.newRasterUpdateChunks.length) {
                            this.oldRasterUpdateChunks = [];
                            for (const updateChunk of this.newRasterUpdateChunks) {
                                const { canvas: oldChunkCanvas, ctx: oldChunkCtx } = createEmptyCanvasWith2dContext(updateChunk.width, updateChunk.height);
                                if (!oldChunkCtx) break;
                                oldChunkCtx.drawImage(sourceCanvas, -updateChunk.x, -updateChunk.y);
                                this.oldRasterUpdateChunks.push({ data: oldChunkCanvas, x: updateChunk.x, y: updateChunk.y, width: updateChunk.width, height: updateChunk.height });
                                await drawImageToCanvas2d(sourceCanvas, updateChunk.data, updateChunk.x, updateChunk.y);
                                if (updateChunk.mode !== 'overlay') sourceCtx.clearRect(updateChunk.x, updateChunk.y, updateChunk.width, updateChunk.height);
                                sourceCtx.drawImage(updateChunk.data, updateChunk.x, updateChunk.y);
                            }
                        } else {
                            for (const updateChunk of this.newRasterUpdateChunks) {
                                await drawImageToCanvas2d(sourceCanvas, updateChunk.data, updateChunk.x, updateChunk.y);
                                // if (updateChunk.mode !== 'overlay') sourceCtx.clearRect(updateChunk.x, updateChunk.y, updateChunk.width, updateChunk.height);
                                // sourceCtx.drawImage(updateChunk.data, updateChunk.x, updateChunk.y);
                            }
                        }
                        layer.data.chunkUpdateId = uuidv4();
                    }
                }
                // else if (layer.type === 'rasterSequence') {
                //     for (let frame of layer.data.sequence) {
                //         if (frame.image.sourceUuid) {
                //             reserveStoredImage(frame.image.sourceUuid, `${layer.id}`);
                //         }
                //     }
                // }
            } else if (prop !== 'id') {
                if (prop === 'type') {
                    if (layer.renderer) {
                        layer.renderer.detach();
                    }
                    layer.renderer = markRaw(new layerRenderers[renderer][this.updateLayerOptions['type'] as string]());
                    if (layer.renderer) {
                        layer.renderer.attach(layer);
                    }
                }

                // Store old values and assign new values
                if ((this.explicitPreviousProps as any)[prop] !== undefined) {
                    (this.previousProps as any)[prop] = (this.explicitPreviousProps as any)[prop];
                } else {
                    (this.previousProps as any)[prop] = (layer as any)[prop];
                }
                (layer as any)[prop] = this.updateLayerOptions[prop];
            }
        }
        await layer.renderer.nextUpdate();
        regenerateLayerThumbnail(layer);
        if (requiresBaking) {
            updateBakedImageForLayer(layer);
        }

        canvasStore.set('dirty', true);
	}

	public async undo() {
        super.undo();

        const layers = workingFileStore.get('layers');
        const layer = getLayerById(this.updateLayerOptions.id, layers);
        const renderer = canvasStore.get('renderer');
        if (layer) {
            for (let prop in this.previousProps) {
                if (prop !== 'id') {
                    (layer as any)[prop] = (this.previousProps as any)[prop];

                    if (prop === 'type') {
                        if (layer.renderer) {
                            layer.renderer.detach();
                        }
                        layer.renderer = markRaw(new layerRenderers[renderer][(layer as any)[prop] as string]());
                        if (layer.renderer) {
                            layer.renderer.attach(layer);
                        }
                    }
                }
            }
            if (layer.type === 'raster') {
                if (this.oldRasterSourceImageId != null && this.oldRasterSourceImageId !== layer.data.sourceUuid) {
                    layer.data.sourceUuid = this.oldRasterSourceImageId;
                }
                updateSourceImageWithChunks:
                if (this.oldRasterUpdateChunks.length > 0) {
                    const sourceCanvas = await prepareStoredImageForEditing(layer.data.sourceUuid);
                    if (!sourceCanvas) break updateSourceImageWithChunks;
                    const sourceCtx = sourceCanvas.getContext('2d', getCanvasRenderingContext2DSettings());
                    if (!sourceCtx) break updateSourceImageWithChunks;
                    for (const updateChunk of this.oldRasterUpdateChunks) {
                        sourceCtx.clearRect(updateChunk.x, updateChunk.y, updateChunk.width, updateChunk.height);
                        sourceCtx.drawImage(updateChunk.data, updateChunk.x, updateChunk.y);
                    }
                    layer.data.chunkUpdateId = uuidv4();
                }
            }
            regenerateLayerThumbnail(layer);
            updateBakedImageForLayer(layer);
        }

        canvasStore.set('dirty', true);
	}

    public free() {
        super.free();

        // This is in the undo history
        if (this.isDone) {
            // For raster layer, if the image source id was changed, free the old one.
            if (this.oldRasterSourceImageId != null && this.oldRasterSourceImageId !== (this.updateLayerOptions as UpdateRasterLayerOptions<ColorModel>)?.data?.sourceUuid) {
                unreserveStoredImage(this.oldRasterSourceImageId, `${this.previousProps.id}`);
            }
        }
        // This is in the redo history
        if (!this.isDone) {
            // For raster layer, if the image source id was changed, free the new one.
            const rasterUpdateLayerOptions = (this.updateLayerOptions as UpdateRasterLayerOptions<ColorModel>);
            const layer = getLayerById(this.updateLayerOptions.id) as WorkingFileRasterLayer<ColorModel>;
            if (rasterUpdateLayerOptions.data?.sourceUuid && rasterUpdateLayerOptions.data?.sourceUuid !== layer?.data?.sourceUuid) {
                unreserveStoredImage(rasterUpdateLayerOptions.data.sourceUuid, `${layer.id}`);
            }
        }

        (this.updateLayerOptions as any) = null;
        (this.previousProps as any) = null;
        this.newRasterUpdateChunks = [];
        this.oldRasterUpdateChunks = [];
    }

}
