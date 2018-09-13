import ApmRawQuery from './apmrawquery'

export class ApmQuery {    

    queryModel: ApmQueryModel;    
    agentSegments: UiSegment[];
    metricSegments: UiSegment[];

    private rawQuery: ApmRawQuery;    
    private uiSegmentSrv: any;

    constructor (uiSegmentSrv: any, queryModel?: ApmQueryModel) {

        this.uiSegmentSrv = uiSegmentSrv;

        if (!queryModel) {
            queryModel = new ApmQueryModel();            

            const newAgentSegment = new AbstractQuerySegment();
            newAgentSegment.fake = true;
            newAgentSegment.value = "select agent";
            queryModel.agentSegments = [newAgentSegment];          
            
            const newMetricSegment = new AbstractQuerySegment();
            newMetricSegment.fake = true;
            newMetricSegment.value = "select metric";
            queryModel.metricSegments = [newMetricSegment];

            queryModel.temporalResolution = "";
        }

        this.queryModel = queryModel;
        this.agentSegments = queryModel.agentSegments.map((abstractSegment => {
            return this.createUiSegmentFromAbstractSegment(abstractSegment);
        }));
        this.metricSegments = queryModel.metricSegments.map((abstractSegment => {
            return this.createUiSegmentFromAbstractSegment(abstractSegment);
        }));

        const rawQuery = new ApmRawQuery();
        rawQuery.agentRegex = this.getAgentRegex(this.agentSegments.length, false);
        rawQuery.metricRegex = this.getMetricRegex(this.metricSegments.length, false);
        rawQuery.temporalResolution = this.queryModel.temporalResolution;
        this.rawQuery = rawQuery;
    }

    updateMetricSegments (metricSegment: UiSegment, segmentIndex: number) {        
        this.updateSegments(this.metricSegments, this.queryModel.metricSegments, metricSegment, segmentIndex, "select metric");
        this.rawQuery.metricRegex = this.getMetricRegex(this.metricSegments.length, false);
    }

    updateAgentSegments (agentSegment: UiSegment, segmentIndex: number) {
        this.updateSegments(this.agentSegments, this.queryModel.agentSegments, agentSegment, segmentIndex, "select agent");
        this.rawQuery.agentRegex = this.getAgentRegex(this.agentSegments.length, false);
    }

    setTemporalResolution (temporalResolution: string) {
        this.queryModel.temporalResolution = temporalResolution;
        this.rawQuery.temporalResolution = temporalResolution;
    }

    getAgentRegex (segmentIndex?: number, trailingSeparator?: boolean) {

        segmentIndex = segmentIndex ? segmentIndex : this.agentSegments.length;
        trailingSeparator = trailingSeparator ? trailingSeparator : false;

        let segmentPath = '';

        if (segmentIndex > 0 && this.agentSegments.length > 0) {
            // we only need the segments up to the specified index
            const slicedSegments = this.agentSegments.slice(0, segmentIndex);

            // join segments using the "|" character
            slicedSegments.forEach((segment, segmentIndex) => {
                if (!segment.fake) {
                    if (segmentIndex === 0 || segment.value.indexOf(":") > -1) {
                        segmentPath += segment.value;
                    } else {
                        segmentPath += "|" + segment.value;
                    }
                }
            });

            if (trailingSeparator && slicedSegments[slicedSegments.length - 1].expandable) {
                segmentPath += "|";
            }
        }

        return segmentPath;
    }

    getMetricRegex (segmentIndex?: number, trailingSeparator?: boolean) {
        
        segmentIndex = segmentIndex ? segmentIndex : this.metricSegments.length;
        trailingSeparator = trailingSeparator ? trailingSeparator : false;

        let segmentPath = '';

        if (segmentIndex > 0 && this.metricSegments.length > 0) {
            // we only need the segments up to the specified index
            const slicedSegments = this.metricSegments.slice(0, segmentIndex);

            // join segments using the "|" character
            slicedSegments.forEach((segment, segmentIndex) => {
                if (!segment.fake) {
                    if (segmentIndex === 0 || segment.value.indexOf(":") > -1) {
                        segmentPath += segment.value;
                    } else {
                        segmentPath += "|" + segment.value;
                    }
                }
            });

            if (trailingSeparator && slicedSegments[slicedSegments.length - 1].expandable) {
                segmentPath += "|";
            }
        }

        return segmentPath;
    }

    getAgentSegments () {
        return this.queryModel.agentSegments;
    }

    getMetricSegments () {
        return this.queryModel.metricSegments;
    }

    getTemporalResolution () {
        return this.queryModel.temporalResolution;
    }

    getRawQuery () {
        return this.rawQuery;
    }

    cloneRawQuery (): ApmRawQuery {
        return JSON.parse(JSON.stringify(this.rawQuery));
    }

    private updateSegments(segments, abstractSegments, updatedSegment: UiSegment, updatedSegmentIndex, newSegmentLabel) {
        
        // discard trailing segments if the updated segment does NOT end with a wildcard
        // reasoning: most likely the trailing segments don't make any sense within the new context
        if (updatedSegment.value.slice(-1) != '*') {
            segments.length = updatedSegmentIndex + 1;
        }

        // if the updated segments ends with a wildcard, make it expandable
        // reasoning: a wildcard segment might allow additional browsable path elements
        if (updatedSegment.value.slice(-1) == '*') {
            updatedSegment.expandable = true
        }

        if (updatedSegmentIndex == segments.length - 1 && updatedSegment.expandable) {
            segments.push(this.uiSegmentSrv.newSegment({
                value: newSegmentLabel,
                fake: true
            }));
        }

        abstractSegments.length = 0;
        segments.forEach((uiSegment) => {            
                const abstractSegment = new AbstractQuerySegment(uiSegment);
                abstractSegments.push(abstractSegment);
        });
    }

    private createUiSegmentFromAbstractSegment(abstractSegment: AbstractQuerySegment) {
        return this.uiSegmentSrv.newSegment({
            fake: abstractSegment.fake,
            value: abstractSegment.value,
            expandable: abstractSegment.expandable,
            text: abstractSegment.text
        }) as UiSegment;
    }
}

export class ApmQueryModel {
    agentSegments: [AbstractQuerySegment];
    metricSegments: [AbstractQuerySegment];
    temporalResolution: string;
}

class AbstractQuerySegment {
    fake: boolean;
    value: string;
    expandable: boolean;
    text: string;

    constructor (uiSegment?: UiSegment) {
        this.fake = uiSegment && uiSegment.fake || false;
        this.value = uiSegment && uiSegment.value || "";
        this.expandable = uiSegment && uiSegment.expandable || false;
        this.text = uiSegment && uiSegment.text || "";
    }
}

interface UiSegment {
    fake: boolean;
    value: string;
    expandable: boolean;
    text: string;
}