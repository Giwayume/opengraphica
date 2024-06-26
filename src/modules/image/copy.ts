import cloneDeep from 'lodash/cloneDeep';
import editorStore from '@/store/editor';
import historyStore from '@/store/history';
import { getStoredImageOrCanvas, createStoredImage } from '@/store/image';
import workingFileStore, { getSelectedLayers } from '@/store/working-file';
import appEmitter from '@/lib/emitter';
import { unexpectedErrorMessage } from '@/lib/notify';
import { createImageFromCanvas } from '@/lib/image';
import { BundleAction } from '@/actions/bundle';
import { ClearSelectionAction } from '@/actions/clear-selection';
import { DeleteLayersAction } from '@/actions/delete-layers';
import { UpdateLayerAction } from '@/actions/update-layer';
import { activeSelectionMask, activeSelectionMaskCanvasOffset, appliedSelectionMask, appliedSelectionMaskCanvasOffset, blitActiveSelectionMask } from '@/canvas/store/selection-state';
import type {
    ColorModel, UpdateAnyLayerOptions, WorkingFileRasterLayer
} from '@/types';

export async function copySelectedLayers() {
    editorStore.set('clipboardBufferLayers',
        cloneDeep(getSelectedLayers())
    );
    const selectionMask = activeSelectionMask.value ?? appliedSelectionMask.value;
    const selectionMaskCanvasOffset = activeSelectionMask.value ? activeSelectionMaskCanvasOffset.value : appliedSelectionMaskCanvasOffset.value;
    editorStore.set('clipboardBufferSelectionMask', selectionMask);
    editorStore.set('clipboardBufferSelectionMaskCanvasOffset', new DOMPoint(selectionMaskCanvasOffset.x, selectionMaskCanvasOffset.y));
    try {
        const { exportAsImage } = await import(/* webpackChunkName: 'module-file-export' */ '../file/export');
        const exportResults = await exportAsImage({
            fileType: 'png',
            layerSelection: 'selected',
            blitActiveSelectionMask: true,
            toClipboard: true,
            generateImageHash: true
        });
        editorStore.set('hasClipboardUpdateSupport', true);
        editorStore.set('clipboardBufferImageHash', exportResults.generatedImageHash);
    } catch (error) {
        console.error('[src/modules/image/copy.ts]', error);
        editorStore.set('clipboardBufferImageHash', null);
        editorStore.set('clipboardBufferUpdateTimestamp', new Date().getTime());
    }
}

export async function cutSelectedLayers() {
    await copySelectedLayers();
    if (activeSelectionMask.value != null || appliedSelectionMask.value != null) {
        const updateLayerActions: UpdateLayerAction<UpdateAnyLayerOptions<ColorModel>>[] = [];
        const selectedLayers = getSelectedLayers();
        for (const layer of selectedLayers) {
            if (layer.type === 'raster') {
                const rasterLayer = layer as WorkingFileRasterLayer<ColorModel>;
                const sourceImage = getStoredImageOrCanvas(rasterLayer.data.sourceUuid);
                if (sourceImage) {
                    const newImage = await blitActiveSelectionMask(sourceImage, rasterLayer.transform, 'source-out');
                    updateLayerActions.push(
                        new UpdateLayerAction({
                            id: rasterLayer.id,
                            data: {
                                sourceUuid: await createStoredImage(newImage),
                            }
                        })
                    );
                }
            }
        }
        await historyStore.dispatch('runAction', {
            action: new BundleAction('cutLayers', 'action.cutLayers', [
                ...updateLayerActions,
                new ClearSelectionAction()
            ])
        });
    } else {
        await historyStore.dispatch('runAction', {
            action: new BundleAction('cutLayers', 'action.cutLayers', [
                new DeleteLayersAction(workingFileStore.state.selectedLayerIds)
            ])
        });
    }
}

// For firefox, experiment with 
// dom.events.asyncClipboard.clipboardItem

export async function copyAllLayers(options = {}) {
    try {
        const { exportAsImage } = await import(/* webpackChunkName: 'module-file-export' */ '../file/export');
        const exportResults = await exportAsImage({
            fileType: 'png',
            toClipboard: true,
            generateImageHash: true
        });
        editorStore.set('hasClipboardUpdateSupport', true);
        editorStore.set('clipboardBufferImageHash', exportResults.generatedImageHash);
    } catch (error: any) {
        editorStore.set('clipboardBufferImageHash', null);
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 1);
        });
        appEmitter.emit('app.notify', {
            type: 'error',
            dangerouslyUseHTMLString: true,
            message: unexpectedErrorMessage
        });
    }
}
