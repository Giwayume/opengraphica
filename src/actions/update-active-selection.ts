
import { BaseAction } from './base';
import { activeSelectionPath, previewActiveSelectionMask, selectionCombineMode, SelectionPathPoint, SelectionCombineMode } from '@/canvas/store/selection-state';
import canvasStore from '@/store/canvas';
import editorStore from '@/store/editor';

interface UpdateActiveSelectionOptions {
    updatePreview?: boolean;
}

export class UpdateActiveSelectionAction extends BaseAction {

    private newActiveSelectionPath: Array<SelectionPathPoint> = [];
    private oldActiveSelectionPath: Array<SelectionPathPoint> = [];
    private oldSelectionCombineMode: SelectionCombineMode | null = null;
    private updatePreview: boolean = true;

    constructor(newActiveSelectionPath: Array<SelectionPathPoint>, oldActiveSelectionPath?: Array<SelectionPathPoint>, options?: UpdateActiveSelectionOptions) {
        super('updateActiveSelection', 'action.updateActiveSelection');
        this.newActiveSelectionPath = newActiveSelectionPath;
        if (oldActiveSelectionPath) {
            this.oldActiveSelectionPath = oldActiveSelectionPath;
        } else {
            this.oldActiveSelectionPath = JSON.parse(JSON.stringify(activeSelectionPath.value));
        }
        this.updatePreview = options?.updatePreview === false ? false : true;
        this.oldSelectionCombineMode = selectionCombineMode.value;
	}

	public async do() {
        super.do();

        activeSelectionPath.value = JSON.parse(JSON.stringify(this.newActiveSelectionPath));
        if (activeSelectionPath.value.length > 0) {
            if (editorStore.get('activeToolGroup') !== 'selection') {
                editorStore.dispatch('setActiveTool', { group: 'selection' });
            }
        }
        if (this.updatePreview) {
            await previewActiveSelectionMask();
        }
        canvasStore.set('viewDirty', true);
    }

    public async undo() {
        super.undo();

        if (this.oldSelectionCombineMode) {
            selectionCombineMode.value = this.oldSelectionCombineMode;
        }
        activeSelectionPath.value = this.oldActiveSelectionPath;
        if (activeSelectionPath.value.length > 0) {
            if (editorStore.get('activeToolGroup') !== 'selection') {
                editorStore.dispatch('setActiveTool', { group: 'selection' });
            }
        }
        // Do not check updatePreview flag for this. Will mess up undo steps.
        await previewActiveSelectionMask();
        canvasStore.set('viewDirty', true);
    }

    public async free() {
        super.free();

        (this.newActiveSelectionPath as any) = null;
        (this.oldActiveSelectionPath as any) = null;
    }
}