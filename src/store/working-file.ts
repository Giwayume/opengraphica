import { PerformantStore } from './performant-store';
import { ColorModel, FileSystemFileHandle, MeasuringUnits, ResolutionUnits, ColorModelName, WorkingFileLayer, WorkingFileAnyLayer, WorkingFileGroupLayer, WorkingFileTimeline } from '@/types';

interface WorkingFileState {
    activeTimelineId: number | null;
    colorModel: ColorModelName;
    colorSpace: string;
    drawOriginX: number;
    drawOriginY: number;
    fileHandle: FileSystemFileHandle | null;
    fileName: string;
    height: number; // Always pixels
    layerIdCounter: number;
    layers: WorkingFileLayer<ColorModel>[];
    measuringUnits: MeasuringUnits;
    resolutionUnits: ResolutionUnits;
    resolutionX: number;
    resolutionY: number;
    scaleFactor: number;
    selectedLayerIds: number[];
    timelineIdCounter: 0;
    timelines: WorkingFileTimeline[];
    width: number; // Always pixels
}

interface WorkingFileStore {
    dispatch: {};
    state: WorkingFileState;
}

const store = new PerformantStore<WorkingFileStore>({
    state: {
        activeTimelineId: null,
        colorModel: 'rgba',
        colorSpace: 'sRGB',
        drawOriginX: 0,
        drawOriginY: 0,
        fileHandle: null,
        fileName: '',
        height: 892, // Always pixels
        layerIdCounter: 0,
        layers: [],
        measuringUnits: 'px',
        resolutionUnits: 'px/in',
        resolutionX: 300,
        resolutionY: 300,
        scaleFactor: 1,
        selectedLayerIds: [],
        timelineIdCounter: 0,
        timelines: [],
        width: 818 // Always pixels
    },
    nonReactive: ['fileHandle']
});

function getLayerById(id: number, parent?: WorkingFileLayer<ColorModel>[]): WorkingFileAnyLayer<ColorModel> | null {
    if (parent == null) {
        parent = store.get('layers');
    }
    for (let layer of parent) {
        if (layer.id === id) {
            return layer as WorkingFileAnyLayer<ColorModel>;
        } else if (layer.type === 'group') {
            let foundLayer = getLayerById(id, (layer as WorkingFileGroupLayer<ColorModel>).layers);
            if (foundLayer) {
                return foundLayer;
            }
        }
    }
    return null;
}

function getLayerGlobalTransform(layerOrId: WorkingFileLayer<ColorModel> | number): DOMMatrix {
    let layer: WorkingFileLayer<ColorModel> | null = null;
    if (typeof layerOrId === 'number') {
        layer = getLayerById(layerOrId);
    } else {
        layer = layerOrId;
    }
    let transform = new DOMMatrix();
    if (layer) {
        if (layer.groupId != null) {
            transform.multiplySelf(getLayerGlobalTransform(layer.groupId));
        }
        transform.multiplySelf(layer.transform);
    }
    return transform;
}

function getGroupLayerById(id: number, parent?: WorkingFileLayer<ColorModel>[]): WorkingFileGroupLayer<ColorModel> | null {
    if (parent == null) {
        parent = store.get('layers');
    }
    const layer = getLayerById(id, parent);
    if (layer && layer.type === 'group') {
        return layer as WorkingFileGroupLayer<ColorModel>;
    }
    return null;
}

function getLayersByType<T extends WorkingFileLayer<ColorModel>>(type: string, parent?: WorkingFileLayer<ColorModel>[]): T[] {
    if (parent == null) {
        parent = store.get('layers');
    }
    let layers: WorkingFileLayer<ColorModel>[] = [];
    for (let layer of parent) {
        if (layer.type === type) {
            layers.push(layer);
        }
        if (layer.type === 'group') {
            layers = layers.concat(getLayersByType(type, (layer as WorkingFileGroupLayer<ColorModel>).layers));
        }
    }
    return layers as T[];
}

function getTimelineById(id: number): WorkingFileTimeline | null {
    const timelines = store.get('timelines');
    for (let timeline of timelines) {
        if (timeline.id === id) {
            return timeline;
        }
    }
    return null;
}

function ensureUniqueLayerSiblingName(layerId: number, name: string): string {
    // TODO TODO TODO
    return name;
}

export default store;

export { WorkingFileStore, WorkingFileState, getLayerById, getLayerGlobalTransform, getLayersByType, getGroupLayerById, getTimelineById, ensureUniqueLayerSiblingName };
