import { BaseAction } from './base';
import { activeSelectionMask, activeSelectionMaskCanvasOffset, appliedSelectionMask, appliedSelectionMaskCanvasOffset, selectionMaskDrawMargin } from '@/canvas/store/selection-state';
import canvasStore from '@/store/canvas';
import workingFileStore, { getLayerById, getLayerGlobalTransform, ensureUniqueLayerSiblingName } from '@/store/working-file';
import { createImageFromCanvas, getImageDataFromImage, getImageDataEmptyBounds } from '@/lib/image';
import { ClearSelectionAction } from './clear-selection';
import { InsertLayerAction } from './insert-layer';
import { SelectLayersAction } from './select-layers';
import renderers from '@/canvas/renderers';
import { WorkingFileLayer, ColorModel, WorkingFileRasterLayer, WorkingFileRasterSequenceLayer, InsertRasterLayerOptions } from '@/types';

interface CreateNewLayersFromSelectionOptions {
    clearSelection?: boolean;
    selectNewLayers?: 'replace' | 'combine';
}

export class CreateNewLayersFromSelectionAction extends BaseAction {

    private selectNewLayers: 'replace' | 'combine' | 'none' = 'none';
    private clearSelection: boolean = false;

    private clearSelectionAction: ClearSelectionAction | null = null;
    private insertLayerActions: InsertLayerAction<any>[] = [];
    private selectLayersAction: SelectLayersAction | null = null;

    constructor(options: CreateNewLayersFromSelectionOptions = {}) {
        super('createNewLayersFromSelection', 'Create Layers From Selection');
        if (options.clearSelection) {
            this.clearSelection = options.clearSelection;
        }
        if (options.selectNewLayers) {
            this.selectNewLayers = options.selectNewLayers;
        }
	}

	public async do() {
        super.do();

        this.freeEstimates.memory = 0;
        this.freeEstimates.database = 0;

        if (this.insertLayerActions.length === 0) {

            // Get list of currently selected layers.
            const selectedLayers: WorkingFileLayer<ColorModel>[] = [];
            const selectedLayerIds = workingFileStore.get('selectedLayerIds');
            if (selectedLayerIds.length > 0) {
                for (let id of selectedLayerIds) {
                    const layer = getLayerById(id);
                    if (layer) {
                        selectedLayers.push(layer);
                    }
                }
            }

            // Get selection mask info
            const selectionMask: HTMLImageElement | null = activeSelectionMask.value || appliedSelectionMask.value;
            if (!selectionMask) {
                throw new Error('Aborted - No selection mask exists.');
            }
            const selectionOffset: DOMPoint = (selectionMask === activeSelectionMask.value ? activeSelectionMaskCanvasOffset.value : appliedSelectionMaskCanvasOffset.value);
            const selectionBounds = getImageDataEmptyBounds(getImageDataFromImage(selectionMask));
            const workingCanvas = document.createElement('canvas');
            workingCanvas.width = selectionBounds.right - selectionBounds.left;
            workingCanvas.height = selectionBounds.bottom - selectionBounds.top;
            const ctx = workingCanvas.getContext('2d');
            if (!ctx) {
                throw new Error('Aborted - Couldn\'t create canvas context.');
            }
            ctx.imageSmoothingEnabled = false;

            // Create new layer for each of the selected layers.
            for (let layer of selectedLayers) {
                if (['raster', 'rasterSequence'].includes(layer.type)) {
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.clearRect(0, 0, workingCanvas.width, workingCanvas.height);
                    ctx.save();
                    ctx.translate(-selectionOffset.x - selectionBounds.left, -selectionOffset.y - selectionBounds.top);
                    const transform = getLayerGlobalTransform(layer);
                    ctx.transform(transform.a, transform.b, transform.c, transform.d, transform.e, transform.f);
                    if (layer.type === 'raster') {
                        renderers.raster.draw(ctx, layer as WorkingFileRasterLayer<ColorModel>);
                    } else {
                        renderers.rasterSequence.draw(ctx, layer as WorkingFileRasterSequenceLayer<ColorModel>);
                    }
                    ctx.restore();
                    ctx.globalCompositeOperation = 'destination-in';
                    ctx.drawImage(selectionMask, -selectionBounds.left, -selectionBounds.top);
                    
                    this.insertLayerActions.push(
                        new InsertLayerAction<InsertRasterLayerOptions<ColorModel>>({
                            type: 'raster',
                            name: ensureUniqueLayerSiblingName(layer.id, layer.name + ' - Selection Copy'),
                            width: workingCanvas.width,
                            height: workingCanvas.height,
                            transform: new DOMMatrix().translateSelf(selectionOffset.x + selectionBounds.left, selectionOffset.y + selectionBounds.top),
                            data: {
                                sourceImage: await createImageFromCanvas(workingCanvas),
                                sourceImageIsObjectUrl: true
                            }
                        })
                    );
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

        let insertedLayerIds = [];
        for (const insertLayerAction of this.insertLayerActions) {
            await insertLayerAction.do();
            insertedLayerIds.push(insertLayerAction.insertedLayerId);
            this.freeEstimates.memory += insertLayerAction.freeEstimates.memory;
            this.freeEstimates.database += insertLayerAction.freeEstimates.database;
        }

        if (this.selectNewLayers !== 'none') {
            if (this.selectLayersAction) {
                this.selectLayersAction.free();
                this.selectLayersAction = null;
            }
            if (this.selectNewLayers === 'replace') {
                this.selectLayersAction = new SelectLayersAction(insertedLayerIds);
            } else {
                this.selectLayersAction = new SelectLayersAction([ ...workingFileStore.get('selectedLayerIds'), ...insertedLayerIds ]);
            }
        }

        if (this.selectLayersAction) {
            await this.selectLayersAction.do();
            this.freeEstimates.memory += this.selectLayersAction.freeEstimates.memory;
            this.freeEstimates.database += this.selectLayersAction.freeEstimates.database;
        }

        canvasStore.set('dirty', true);
        canvasStore.set('viewDirty', true);
    }

    public async undo() {
        super.undo();

        this.freeEstimates.memory = 0;
        this.freeEstimates.database = 0;

        for (const insertLayerAction of this.insertLayerActions.reverse()) {
            await insertLayerAction.undo();
            this.freeEstimates.memory += insertLayerAction.freeEstimates.memory;
            this.freeEstimates.database += insertLayerAction.freeEstimates.database;
        }

        if (this.clearSelectionAction) {
            await this.clearSelectionAction.undo();
            this.freeEstimates.memory += this.clearSelectionAction.freeEstimates.memory;
            this.freeEstimates.database += this.clearSelectionAction.freeEstimates.database;
        }

        if (this.selectLayersAction) {
            await this.selectLayersAction.undo();
            this.freeEstimates.memory += this.selectLayersAction.freeEstimates.memory;
            this.freeEstimates.database += this.selectLayersAction.freeEstimates.database;
        }

        canvasStore.set('dirty', true);
        canvasStore.set('viewDirty', true);
    }

    public async free() {
        super.free();

        for (const insertLayerAction of this.insertLayerActions) {
            insertLayerAction.free();
        }
        if (this.selectLayersAction) {
            this.selectLayersAction.free();
            this.selectLayersAction = null;
        }
        if (this.clearSelectionAction) {
            this.clearSelectionAction.free();
            this.clearSelectionAction = null;
        }
        (this.insertLayerActions as any) = null;
    }
}