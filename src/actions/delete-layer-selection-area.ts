import { BaseAction } from './base';
import { activeSelectionMask, activeSelectionMaskCanvasOffset, appliedSelectionMask, appliedSelectionMaskCanvasOffset, blitActiveSelectionMask } from '@/canvas/store/selection-state';
import canvasStore from '@/store/canvas';
import workingFileStore, { getCanvasRenderingContext2DSettings, getSelectedLayers, ensureUniqueLayerSiblingName, getLayerById } from '@/store/working-file';
import { createImageFromCanvas, getImageDataFromImage, getImageDataEmptyBounds } from '@/lib/image';
import { ClearSelectionAction } from './clear-selection';
import { UpdateLayerAction } from './update-layer';
import { SelectLayersAction } from './select-layers';
import renderers from '@/canvas/renderers';
import { getStoredImageOrCanvas, createStoredImage } from '@/store/image';

import type {
    ColorModel, WorkingFileRasterLayer, WorkingFileRasterSequenceLayer, InsertRasterLayerOptions, UpdateAnyLayerOptions
} from '@/types';

interface DeleteLayerSelectionAreaOptions {
    clearSelection?: boolean;
}

export class DeleteLayerSelectionAreaAction extends BaseAction {

    private layerIds: number[];
    private clearSelection: boolean = false;

    private clearSelectionAction: ClearSelectionAction | null = null;
    private updateLayerActions: UpdateLayerAction<UpdateAnyLayerOptions<ColorModel>>[] = [];

    constructor(layerIds: number[] = workingFileStore.state.selectedLayerIds, options?: DeleteLayerSelectionAreaOptions) {
        super('deleteLayerSelectionArea', 'action.deleteLayerSelectionArea');
        this.layerIds = layerIds;

        this.clearSelection = (options?.clearSelection === false) ? false : true;
	}

	public async do() {
        super.do();

        this.freeEstimates.memory = 0;
        this.freeEstimates.database = 0;

        const layersToModify = [];
        for (const layerId of this.layerIds) {
            const layer = getLayerById(layerId);
            if (layer) {
                layersToModify.push(layer);
            }
        }

        // Edit image data for each layer
        this.updateLayerActions = [];
        for (const layer of layersToModify) {
            if (layer.type === 'raster') {
                const sourceImage = getStoredImageOrCanvas(layer.data.sourceUuid);
                if (sourceImage) {
                    const newImage = await blitActiveSelectionMask(sourceImage, layer.transform, 'source-out');
                    const updateLayerAction = new UpdateLayerAction({
                        id: layer.id,
                        data: {
                            sourceUuid: await createStoredImage(newImage),
                        }
                    });
                    await updateLayerAction.do();
                    this.freeEstimates.memory += updateLayerAction.freeEstimates.memory;
                    this.freeEstimates.database += updateLayerAction.freeEstimates.database;
                    this.updateLayerActions.push(updateLayerAction);
                }
            }
        }
        
        if (this.clearSelection && !this.clearSelectionAction) {
            this.clearSelectionAction = new ClearSelectionAction();
        }

        if (this.clearSelectionAction) {
            await this.clearSelectionAction.do();
            this.freeEstimates.memory += this.clearSelectionAction.freeEstimates.memory;
            this.freeEstimates.database += this.clearSelectionAction.freeEstimates.database;
        }

        canvasStore.set('dirty', true);
        canvasStore.set('viewDirty', true);
    }

    public async undo() {
        super.undo();

        this.freeEstimates.memory = 0;
        this.freeEstimates.database = 0;

        if (this.clearSelectionAction) {
            await this.clearSelectionAction.undo();
            this.freeEstimates.memory += this.clearSelectionAction.freeEstimates.memory;
            this.freeEstimates.database += this.clearSelectionAction.freeEstimates.database;
        }

        for (const updateLayerAction of this.updateLayerActions) {
            await updateLayerAction.undo();
            this.freeEstimates.memory += updateLayerAction.freeEstimates.memory;
            this.freeEstimates.database += updateLayerAction.freeEstimates.database;
        }

        canvasStore.set('dirty', true);
        canvasStore.set('viewDirty', true);
    }

    public async free() {
        super.free();

        if (this.clearSelectionAction) {
            this.clearSelectionAction.free();
            this.clearSelectionAction = null;
        }

        for (const updateLayerAction of this.updateLayerActions) {
            updateLayerAction.free();
        }
        (this.updateLayerActions as any) = null;
    }
}