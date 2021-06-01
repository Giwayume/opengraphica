import { PerformantStore } from './performant-store';
import { RGBAColor, MeasuringUnits, ResolutionUnits, ColorModelName, WorkingFileLayer, WorkingFileGroupLayer, WorkingFileTimeline } from '@/types';

interface WorkingFileState {
    activeTimelineId: number | null,
    colorModel: ColorModelName;
    colorSpace: string;
    drawOriginX: number;
    drawOriginY: number;
    fileName: string;
    height: number; // Always pixels
    layerIdCounter: number;
    layers: WorkingFileLayer<RGBAColor>[];
    measuringUnits: MeasuringUnits;
    resolutionUnits: ResolutionUnits;
    resolutionX: number;
    resolutionY: number;
    scaleFactor: number;
    selectedLayerIds: number[];
    timelineIdCounter: 0,
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
    }
});

function getLayerById(id: number, parent?: WorkingFileLayer<RGBAColor>[]): WorkingFileLayer<RGBAColor> | null {
    if (parent == null) {
        parent = store.get('layers');
    }
    for (let layer of parent) {
        if (layer.id === id) {
            return layer;
        } else if (layer.type === 'group') {
            let foundLayer = getLayerById(id, (layer as WorkingFileGroupLayer<RGBAColor>).layers);
            if (foundLayer) {
                return foundLayer;
            }
        }
    }
    return null;
}

function getGroupLayerById(id: number, parent?: WorkingFileLayer<RGBAColor>[]): WorkingFileGroupLayer<RGBAColor> | null {
    if (parent == null) {
        parent = store.get('layers');
    }
    const layer = getLayerById(id, parent);
    if (layer && layer.type === 'group') {
        return layer as WorkingFileGroupLayer<RGBAColor>;
    }
    return null;
}

function getLayersByType(type: string, parent?: WorkingFileLayer<RGBAColor>[]): WorkingFileLayer<RGBAColor>[] {
    if (parent == null) {
        parent = store.get('layers');
    }
    let layers: WorkingFileLayer<RGBAColor>[] = [];
    for (let layer of parent) {
        if (layer.type === type) {
            layers.push(layer);
        }
        if (layer.type === 'group') {
            layers = layers.concat(getLayersByType(type, (layer as WorkingFileGroupLayer<RGBAColor>).layers));
        }
    }
    return layers;
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

export default store;

export { WorkingFileStore, WorkingFileState, getLayerById, getLayersByType, getGroupLayerById, getTimelineById };
