import BaseMovementController from './base-movement';
import { ref, watch, toRefs, WatchStopHandle } from 'vue';
import { PointerTracker } from './base';
import {
    isDrawingSelection, selectionAddShape, activeSelectionPath, selectionCombineMode, selectionEmitter,
    SelectionPathPoint, appliedSelectionMask, previewSelectedLayersSelectionMask, discardSelectedLayersSelectionMask
} from '../store/selection-state';
import canvasStore from '@/store/canvas';
import editorStore from '@/store/editor';
import historyStore from '@/store/history';
import workingFileStore from '@/store/working-file';
import appEmitter from '@/lib/emitter';
import { normalizedDirectionVector2d, lineIntersectsLine2d } from '@/lib/math';
import { dismissTutorialNotification, scheduleTutorialNotification, waitForNoOverlays } from '@/lib/tutorial';
import { ApplyActiveSelectionAction } from '@/actions/apply-active-selection';
import { ClearSelectionAction } from '@/actions/clear-selection';
import { UpdateActiveSelectionAction } from '@/actions/update-active-selection';
import { UpdateSelectionCombineModeAction } from '@/actions/update-selection-combine-mode';

export default class SelectionController extends BaseMovementController {
    private asyncActionStack: Array<{ callback: (...args: any[]) => Promise<any>, args?: any[] }> = [];
    private currentAsyncAction: ({ callback: (...args: any[]) => Promise<any>, args?: any[] }) | undefined = undefined;
    private dragStartActiveSelectionPath: Array<SelectionPathPoint> | undefined = undefined;
    private dragStartHandleIndex: number = -1;
    private dragStartRectangleOriginToLeftDirection: { x: number, y: number } | null = null; 
    private dragStartRectangleOriginToRightDirection: { x: number, y: number } | null = null;
    private selectedLayerUnwatch: WatchStopHandle | null = null;

    private hoveringActiveSelectionPathIndex: number = -1;
    private dragHandleRadius: number = 6;

    queueAsyncAction(callback: (...args: any[]) => Promise<any>, args?: any[]) {
        this.asyncActionStack.push({
            callback,
            args
        });
        this.runCurrentAsyncAction();
    }

    runCurrentAsyncAction() {
        if (this.currentAsyncAction == null) {
            this.currentAsyncAction = this.asyncActionStack.shift();
            if (this.currentAsyncAction) {
                this.currentAsyncAction.callback.apply(this, this.currentAsyncAction.args || []).then(() => {
                    this.currentAsyncAction = undefined;
                    this.runCurrentAsyncAction();
                }).catch(() => {
                    this.currentAsyncAction = undefined;
                    this.runCurrentAsyncAction();
                });
            }
        }
    }

    async onEnter(): Promise<void> {
        super.onEnter();

        this.queueApplyActiveSelection = this.queueApplyActiveSelection.bind(this);
        this.queueClearSelection = this.queueClearSelection.bind(this);
        this.queueUpdateSelectionCombineMode = this.queueUpdateSelectionCombineMode.bind(this);
        appEmitter.on('editor.tool.commitCurrentAction', this.queueApplyActiveSelection);
        appEmitter.on('editor.tool.selectAll', this.queueClearSelection);
        selectionEmitter.on('applyActiveSelection', this.queueApplyActiveSelection);
        selectionEmitter.on('clearSelection', this.queueClearSelection);
        selectionEmitter.on('updateSelectionCombineMode', this.queueUpdateSelectionCombineMode);
        this.selectedLayerUnwatch = watch([toRefs(workingFileStore.state).selectedLayerIds], async () => {
            await previewSelectedLayersSelectionMask();
            canvasStore.set('viewDirty', true);
        }, { immediate: true });

        // Tutorial message
        if (!editorStore.state.tutorialFlags.selectionToolIntroduction) {
            waitForNoOverlays().then(() => {
                let messageStart = `
                    <p class="mb-3">The selection tool allows you to select specific parts of the image to restrict what editing affects.</p>
                `;
                let messageEnd = `
                    <p class="mb-3"><strong class="has-text-weight-bold"><span class="bi bi-square"></span> Selection Shape</strong> - What shape is used to draw the selection.<p>
                    <p><strong class="has-text-weight-bold"><span class="bi bi-plus-circle-dotted"></span> Selection Combine Mode</strong> - How the current selection combines with the existing selection.<p>
                `;
                scheduleTutorialNotification({
                    flag: 'selectionToolIntroduction',
                    title: 'Selection Tool',
                    message: {
                        touch: messageStart + `
                            <p class="mb-3"><strong class="has-text-weight-bold"><span class="bi bi-bounding-box"></span> Create Selection</strong> - Draw with one finger to create a selection.</p>
                        ` + messageEnd,
                        mouse: messageStart + `
                            <p class="mb-3"><strong class="has-text-weight-bold"><span class="bi bi-bounding-box"></span> Create Selection</strong> - Click and drag with <em>Left Click</em> to create a selection.</p>
                        ` + messageEnd
                    }
                });
            });
        }
    }

    onLeave(): void {
        super.onLeave();
        appEmitter.off('editor.tool.commitCurrentAction', this.queueApplyActiveSelection);
        appEmitter.off('editor.tool.selectAll', this.queueClearSelection);
        selectionEmitter.off('applyActiveSelection', this.queueApplyActiveSelection);
        selectionEmitter.off('clearSelection', this.queueClearSelection);
        selectionEmitter.off('updateSelectionCombineMode', this.queueUpdateSelectionCombineMode);
        if (this.selectedLayerUnwatch) {
            this.selectedLayerUnwatch();
        }
        discardSelectedLayersSelectionMask();
        canvasStore.set('viewDirty', true);

        // Tutorial Message
        if (!editorStore.state.tutorialFlags.selectionToolIntroduction) {
            dismissTutorialNotification('selectionToolIntroduction');
        }
    }

    onMultiTouchDown() {
        super.onMultiTouchDown();
        if (this.touches.length === 1) {
            // this.isListenToTouchMove = true;
        }
    }

    onMultiTouchUp() {
        super.onMultiTouchUp();
        // this.isListenToTouchMove = false;
    }
    
    onMultiTouchTap(touches: PointerTracker[]) {
        super.onMultiTouchTap(touches);
        if (touches.length === 1) {
            if (this.canAddPoint()) {
                this.addPoint();
            }
        }
    }

    onPointerMove(e: PointerEvent): void {
        super.onPointerMove(e);

        if (
            e.isPrimary
        ) {
            const pointer = this.pointers.filter((pointer) => pointer.id === e.pointerId)[0];
            if (pointer && (pointer.type !== 'touch' || this.multiTouchDownCount === 1) && pointer.down.button === 0 && pointer.isDragging) {

                // Create selection path or find drag handle
                if (!this.dragStartActiveSelectionPath && this.dragStartHandleIndex == -1) {
                    this.dragStartHandleIndex = this.getDragHandleIndexAtPagePoint(pointer.down.pageX, pointer.down.pageY);
                    if (this.dragStartHandleIndex === -1) {
                        this.dragStartActiveSelectionPath = [];
                        if (activeSelectionPath.value.length > 0) {
                            this.queueAsyncAction((activeSelectionPathOverride: Array<SelectionPathPoint>) => {
                                return this.applyActiveSelection(activeSelectionPathOverride, { doNotClearActiveSelection: true });
                            }, [[...activeSelectionPath.value]]);
                        }
                    } else {
                        this.dragStartActiveSelectionPath = JSON.parse(JSON.stringify(activeSelectionPath.value));
                    }
                }

                const transform = canvasStore.get('transform');
                const transformInverse = transform.inverse();
                const startCursorX = pointer.down.pageX;
                const startCursorY = pointer.down.pageY;
                const cursorX = e.pageX;
                const cursorY = e.pageY;

                // Drag handle of active path
                if (this.dragStartHandleIndex > -1 && activeSelectionPath.value.length - 1 >= this.dragStartHandleIndex && this.dragStartActiveSelectionPath) {
                    const editorShapeIntent = activeSelectionPath.value[0]?.editorShapeIntent;
                    if (editorShapeIntent === 'rectangle') {
                        const dragHandle = activeSelectionPath.value[this.dragStartHandleIndex];
                        let staticHandleIndex = this.dragStartHandleIndex + 2;
                        if (staticHandleIndex > activeSelectionPath.value.length - 1) staticHandleIndex -= 4;
                        const staticHandle = activeSelectionPath.value[staticHandleIndex];
                        let leftHandleIndex = this.dragStartHandleIndex - 1;
                        if (leftHandleIndex < 1) leftHandleIndex += 4;
                        const leftHandle = activeSelectionPath.value[leftHandleIndex];
                        let rightHandleIndex = this.dragStartHandleIndex + 1;
                        if (rightHandleIndex > activeSelectionPath.value.length - 1) rightHandleIndex -= 4;
                        const rightHandle = activeSelectionPath.value[rightHandleIndex];
                        if (!this.dragStartRectangleOriginToLeftDirection) {
                            this.dragStartRectangleOriginToLeftDirection = normalizedDirectionVector2d(
                                staticHandle.x, staticHandle.y, leftHandle.x, leftHandle.y
                            );
                        }
                        if (!this.dragStartRectangleOriginToRightDirection) {
                            this.dragStartRectangleOriginToRightDirection = normalizedDirectionVector2d(
                                staticHandle.x, staticHandle.y, rightHandle.x, rightHandle.y
                            );
                        }
                        const newDragHandlePosition = new DOMPoint(cursorX * devicePixelRatio, cursorY * devicePixelRatio).matrixTransform(transformInverse);
                        const leftIntersection = lineIntersectsLine2d(
                            staticHandle.x, staticHandle.y, staticHandle.x + this.dragStartRectangleOriginToLeftDirection.x, staticHandle.y + this.dragStartRectangleOriginToLeftDirection.y,
                            newDragHandlePosition.x, newDragHandlePosition.y, newDragHandlePosition.x + this.dragStartRectangleOriginToRightDirection.x, newDragHandlePosition.y + this.dragStartRectangleOriginToRightDirection.y
                        );
                        const rightIntersection = lineIntersectsLine2d(
                            staticHandle.x, staticHandle.y, staticHandle.x + this.dragStartRectangleOriginToRightDirection.x, staticHandle.y + this.dragStartRectangleOriginToRightDirection.y,
                            newDragHandlePosition.x, newDragHandlePosition.y, newDragHandlePosition.x + this.dragStartRectangleOriginToLeftDirection.x, newDragHandlePosition.y + this.dragStartRectangleOriginToLeftDirection.y
                        );
                        if (leftIntersection != null && rightIntersection != null) {
                            dragHandle.x = newDragHandlePosition.x;
                            dragHandle.y = newDragHandlePosition.y;
                            leftHandle.x = leftIntersection.x;
                            leftHandle.y = leftIntersection.y;
                            rightHandle.x = rightIntersection.x;
                            rightHandle.y = rightIntersection.y;
                            activeSelectionPath.value[0].x = activeSelectionPath.value[4].x;
                            activeSelectionPath.value[0].y = activeSelectionPath.value[4].y;
                            activeSelectionPath.value = [...activeSelectionPath.value];
                        }
                    } else if (editorShapeIntent === 'ellipse') {
                        console.log('drag ellipse');
                    } else {
                        // Free
                    }
                }
                else { // Create a shape
                    isDrawingSelection.value = true;
                    
                    const decomposedTransform = canvasStore.get('decomposedTransform');

                    if (['rectangle', 'ellipse'].includes(selectionAddShape.value)) {
                        const viewLeft = Math.min(startCursorX, cursorX);
                        const viewRight = Math.max(startCursorX, cursorX);
                        const viewTop = Math.min(startCursorY, cursorY);
                        const viewBottom = Math.max(startCursorY, cursorY);
                        const topLeft = new DOMPoint(viewLeft * devicePixelRatio, viewTop * devicePixelRatio).matrixTransform(transformInverse);
                        const topRight = new DOMPoint(viewRight * devicePixelRatio, viewTop * devicePixelRatio).matrixTransform(transformInverse);
                        const bottomLeft = new DOMPoint(viewLeft * devicePixelRatio, viewBottom * devicePixelRatio).matrixTransform(transformInverse);
                        const bottomRight = new DOMPoint(viewRight * devicePixelRatio, viewBottom * devicePixelRatio).matrixTransform(transformInverse);
                        if (Math.round(decomposedTransform.rotation * Math.RADIANS_TO_DEGREES) % 90 === 0) {
                            topLeft.x = Math.round(topLeft.x);
                            topLeft.y = Math.round(topLeft.y);
                            topRight.x = Math.round(topRight.x);
                            topRight.y = Math.round(topRight.y);
                            bottomLeft.x = Math.round(bottomLeft.x);
                            bottomLeft.y = Math.round(bottomLeft.y);
                            bottomRight.x = Math.round(bottomRight.x);
                            bottomRight.y = Math.round(bottomRight.y);
                        }

                        if (selectionAddShape.value === 'rectangle') {
                            activeSelectionPath.value = [
                                {
                                    type: 'move',
                                    editorShapeIntent: 'rectangle',
                                    x: topLeft.x,
                                    y: topLeft.y
                                },
                                {
                                    type: 'line',
                                    x: topRight.x,
                                    y: topRight.y
                                },
                                {
                                    type: 'line',
                                    x: bottomRight.x,
                                    y: bottomRight.y
                                },
                                {
                                    type: 'line',
                                    x: bottomLeft.x,
                                    y: bottomLeft.y
                                },
                                {
                                    type: 'line',
                                    x: topLeft.x,
                                    y: topLeft.y
                                }
                            ];
                        } else { // Ellipse
                            // https://stackoverflow.com/questions/1734745/how-to-create-circle-with-b%C3%A9zier-curves
                            const circularHandleOffset = 0.552284749831;
                            const topX = topLeft.x + ((topRight.x - topLeft.x) / 2);
                            const topY = topLeft.y + ((topRight.y - topLeft.y) / 2);
                            const topRightHandleX = topX + ((topRight.x - topX) * circularHandleOffset);
                            const topRightHandleY = topY + ((topRight.y - topY) * circularHandleOffset);
                            const topLeftHandleX = topX + ((topLeft.x - topX) * circularHandleOffset);
                            const topLeftHandleY = topY + ((topLeft.y - topY) * circularHandleOffset);
                            const bottomX = bottomLeft.x + ((bottomRight.x - bottomLeft.x) / 2);
                            const bottomY = bottomLeft.y + ((bottomRight.y - bottomLeft.y) / 2);
                            const bottomLeftHandleX = bottomX + ((bottomLeft.x - bottomX) * circularHandleOffset);
                            const bottomLeftHandleY = bottomY + ((bottomLeft.y - bottomY) * circularHandleOffset);
                            const bottomRightHandleX = bottomX + ((bottomRight.x - bottomX) * circularHandleOffset);
                            const bottomRightHandleY = bottomY + ((bottomRight.y - bottomY) * circularHandleOffset);
                            const leftX = topLeft.x + ((bottomLeft.x - topLeft.x) / 2);
                            const leftY = topLeft.y + ((bottomLeft.y - topLeft.y) / 2);
                            const leftTopHandleX = leftX + ((topLeft.x - leftX) * circularHandleOffset);
                            const leftTopHandleY = leftY + ((topLeft.y - leftY) * circularHandleOffset);
                            const leftBottomHandleX = leftX + ((bottomLeft.x - leftX) * circularHandleOffset);
                            const leftBottomHandleY = leftY + ((bottomLeft.y - leftY) * circularHandleOffset);
                            const rightX = topRight.x + ((bottomRight.x - topRight.x) / 2);
                            const rightY = topRight.y + ((bottomRight.y - topRight.y) / 2);
                            const rightTopHandleX = rightX + ((topRight.x - rightX) * circularHandleOffset);
                            const rightTopHandleY = rightY + ((topRight.y - rightY) * circularHandleOffset);
                            const rightBottomHandleX = rightX + ((bottomRight.x - rightX) * circularHandleOffset);
                            const rightBottomHandleY = rightY + ((bottomRight.y - rightY) * circularHandleOffset);
                            activeSelectionPath.value = [
                                {
                                    type: 'move',
                                    editorShapeIntent: 'ellipse',
                                    x: topX,
                                    y: topY
                                },
                                {
                                    type: 'quadraticBezierCurve',
                                    x: rightX,
                                    y: rightY,
                                    shx: topRightHandleX,
                                    shy: topRightHandleY,
                                    ehx: rightTopHandleX,
                                    ehy: rightTopHandleY
                                },
                                {
                                    type: 'quadraticBezierCurve',
                                    x: bottomX,
                                    y: bottomY,
                                    shx: rightBottomHandleX,
                                    shy: rightBottomHandleY,
                                    ehx: bottomRightHandleX,
                                    ehy: bottomRightHandleY
                                },
                                {
                                    type: 'quadraticBezierCurve',
                                    x: leftX,
                                    y: leftY,
                                    shx: bottomLeftHandleX,
                                    shy: bottomLeftHandleY,
                                    ehx: leftBottomHandleX,
                                    ehy: leftBottomHandleY
                                },
                                {
                                    type: 'quadraticBezierCurve',
                                    x: topX,
                                    y: topY,
                                    shx: leftTopHandleX,
                                    shy: leftTopHandleY,
                                    ehx: topLeftHandleX,
                                    ehy: topLeftHandleY
                                }
                            ];
                        }
                    }
                }
            } else {
                // Track hover state over drag handles
                this.hoveringActiveSelectionPathIndex = -1;
                if (activeSelectionPath.value.length > 0) {
                    this.hoveringActiveSelectionPathIndex = this.getDragHandleIndexAtPagePoint(e.pageX, e.pageY);
                }
            }

            this.handleCursorIcon();
        }
    }

    async onPointerUpBeforePurge(e: PointerEvent): Promise<void> {
        super.onPointerUpBeforePurge(e);

        const pointer = this.pointers.filter((pointer) => pointer.id === e.pointerId)[0];
        if (pointer && pointer.down.button === 0) {
            if (pointer.isDragging) {
                isDrawingSelection.value = false;
                if (this.dragStartHandleIndex > -1 || this.dragStartActiveSelectionPath) {
                    this.queueAsyncAction((newPath: Array<SelectionPathPoint>, oldPath?: Array<SelectionPathPoint>) => {
                        return this.updateActiveSelection(newPath, oldPath);
                    }, [activeSelectionPath.value, this.dragStartActiveSelectionPath]);
                }
                this.dragStartActiveSelectionPath = undefined;
                this.dragStartHandleIndex = -1;
                this.dragStartRectangleOriginToLeftDirection = null;
                this.dragStartRectangleOriginToRightDirection = null;
            } else {
                if (e.isPrimary && ['mouse', 'pen'].includes(e.pointerType) && e.button === 0) {
                    if (this.canAddPoint()) {
                        this.addPoint();
                    }
                }
            }
        }
    }

    private getDragHandleIndexAtPagePoint(x: number, y: number) {
        let pointIndex = -1;
        const transform = canvasStore.get('transform');
        const transformInverse = transform.inverse();
        const cursor = new DOMPoint(x * devicePixelRatio, y * devicePixelRatio).matrixTransform(transformInverse);

        for (const [pathPointIndex, pathPoint] of activeSelectionPath.value.entries()) {
            if (pathPoint.type === 'line' || pathPoint.type === 'quadraticBezierCurve') {
                if (Math.abs(cursor.x - pathPoint.x) < this.dragHandleRadius * devicePixelRatio && Math.abs(cursor.y - pathPoint.y) < this.dragHandleRadius * devicePixelRatio) {
                    pointIndex = pathPointIndex;
                    break;
                }
            }
        }
        return pointIndex;
    }

    private addPoint() {
        // TODO
    }

    private canAddPoint() {
        return selectionAddShape.value === 'free';
    }

    async applyActiveSelection(activeSelectionPathOverride: Array<SelectionPathPoint> = activeSelectionPath.value, options?: any) {
        await historyStore.dispatch('runAction', {
            action: new ApplyActiveSelectionAction(activeSelectionPathOverride, options)
        });
    }

    async queueApplyActiveSelection() {
        this.queueAsyncAction((activeSelectionPathOverride: Array<SelectionPathPoint>) => {
            return this.applyActiveSelection(activeSelectionPathOverride);
        }, [[...activeSelectionPath.value]]);
    }

    async updateActiveSelection(newPath: Array<SelectionPathPoint>, oldPath?: Array<SelectionPathPoint>) {
        await historyStore.dispatch('runAction', {
            action: new UpdateActiveSelectionAction(newPath, oldPath)
        });
    }

    async clearSelection() {
        await historyStore.dispatch('runAction', {
            action: new ClearSelectionAction()
        });
    }

    async queueClearSelection() {
        this.queueAsyncAction(() => {
            return this.clearSelection();
        });
    }

    async queueUpdateSelectionCombineMode(event: any) {
        this.queueAsyncAction(async () => {
            await historyStore.dispatch('runAction', {
                action: new UpdateSelectionCombineModeAction(event, selectionCombineMode.value),
                mergeWithHistory: ['applyActiveSelection']
            });
        });
    }

    protected handleCursorIcon() {
        let newIcon = super.handleCursorIcon();
        if (!newIcon) {
            if (this.hoveringActiveSelectionPathIndex > -1) {
                newIcon = 'grabbing';
            } else {
                newIcon = 'crosshair';
            }
        }
        canvasStore.set('cursor', newIcon);
        return newIcon;
    }
}
