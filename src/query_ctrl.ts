// @ts-ignore
import { QueryCtrl } from 'app/plugins/sdk';
import { ApmQuery, ApmQueryModel } from './apmquery'
import ApmRawQuery from './apmrawquery'

interface Target {
    rawQuery: ApmRawQuery;
    queryModel: ApmQueryModel;
    isRawQueryModeEnabled: boolean;
}

export class ApmQueryCtrl extends QueryCtrl {

    static templateUrl = 'partials/query.editor.html';
    private static frequencyOptions: string[] = ["15s", "30s", "1m", "2m", "6m", "12m", "24m", "48m", "1h", "168m", "12h"];

    scope: any;
    query: ApmQuery;
    temporalResolution: string;

    private _target: Target
    private target: any
    private panelCtrl: any;
    private datasource: any;

    constructor($scope, $injector, private $q, private uiSegmentSrv, private templateSrv) {
        super($scope, $injector);

        this.uiSegmentSrv = uiSegmentSrv;       
        this.scope = $scope;
        this._target = this.target as Target

        this.parseTarget();
    }

    toggleEditorMode() {        
        if (!this._target.isRawQueryModeEnabled) {
            // set regex according to segments when switching back from raw query mode
            //this.target.metricRegex = this.getSegmentPathUpToIndex(this.metricSegments, this.metricSegments.length, false);
            //this.target.agentRegex = this.getSegmentPathUpToIndex(this.agentSegments, this.agentSegments.length, false);
            this._target.rawQuery = this.query.cloneRawQuery();
        } else {
            this._target.rawQuery = this.query.getRawQuery();
        }
        this._target.isRawQueryModeEnabled = !this._target.isRawQueryModeEnabled;
        this.panelCtrl.refresh();
    }

    onChangeInternal() {
        this.panelCtrl.refresh();
    }

    onMetricSegmentUpdate = (metricSegment, segmentIndex) => {        
        //this.updateSegments(this.metricSegments, metricSegment, segmentIndex, "select metric")
        this.query.updateMetricSegments(metricSegment, segmentIndex);
        //this.target.metricRegex = this.getSegmentPathUpToIndex(this.metricSegments, this.metricSegments.length, false);        
        this.panelCtrl.refresh();
    }

    onAgentSegmentUpdate = (agentSegment, segmentIndex) => {
        //this.updateSegments(this.agentSegments, agentSegment, segmentIndex, "select agent")
        this.query.updateAgentSegments(agentSegment, segmentIndex);
        //this.target.agentRegex = this.getSegmentPathUpToIndex(this.agentSegments, this.agentSegments.length, false);
        this.panelCtrl.refresh();
    }

    onFrequencyUpdate() {        
        //this.target.dataFrequency = this.frequency;
        this.query.setTemporalResolution(this.temporalResolution);
        this.panelCtrl.refresh();
    }

    getAgentSegments(index) {
        //const agentRegex = this.getSegmentPathUpToIndex(this.agentSegments, index, true);
        const agentRegex = this.query.getAgentRegex(index, true);
        return this.datasource.getAgentSegments(agentRegex)
            .then(this.transformPathToSegments(index));
    }

    getMetricSegments(index) {
        //const agentRegex = this.getSegmentPathUpToIndex(this.agentSegments, this.agentSegments.length, true);
        const agentRegex = this.query.getAgentRegex(null, true);
        //const metricRegex = this.getSegmentPathUpToIndex(this.metricSegments, index, false);
        const metricRegex = this.query.getMetricRegex(index, false);
        return this.datasource.getMetricSegments(agentRegex, metricRegex)
            .then(this.transformPathToSegments(index));
    }

    getFrequencyOptions() {
        return ApmQueryCtrl.frequencyOptions
            .concat(
            this.templateSrv.variables.filter((variable) => {
                return variable.type === "interval";
            })
                .map((variable) => {
                    return "$" + variable.name;
                }))
            .map((interval) => {
                return {
                    text: interval,
                    value: interval
                }
            });
    }

    getCollapsedText() {
        if (!this._target.isRawQueryModeEnabled) {
            return "" + this._target.rawQuery.agentRegex + "|" + this._target.rawQuery.metricRegex + " [" + this._target.rawQuery.temporalResolution + "]"
        } else {
            return "" + this.query.getAgentRegex + "|" + this.query.getMetricRegex + " [" + this.query.getTemporalResolution + "]"
        }
    }

    private parseTarget() {

        if (this._target.isRawQueryModeEnabled) {
            if (!this._target.rawQuery) {
                this._target.rawQuery = new ApmRawQuery();                
            }
            this.query = new ApmQuery(this.uiSegmentSrv);
            this._target.queryModel = this.query.queryModel;
            this.temporalResolution = this._target.rawQuery.temporalResolution || "select temporal resolution";
        } else {
            if (!this._target.queryModel) {
                this.query = new ApmQuery(this.uiSegmentSrv);
                this._target.queryModel = this.query.queryModel;
            } else {
                this.query = new ApmQuery(this.uiSegmentSrv, this._target.queryModel);
            }
            this._target.rawQuery = this.query.getRawQuery();
            this.temporalResolution = this.query.getTemporalResolution() || "select temporal resolution";
        }
    }

    private transformPathToSegments(segmentIndex) {
        return (paths) => {
            let splittedPaths = [];
            const segmentMap = {};

            // split all paths at "|"
            for (var i = 0; i < paths.length; i++) {
                splittedPaths.push(paths[i].split("|"));
            }

            splittedPaths.forEach((splittings) => {
                // if the last splitting contains a ":" character ...
                if (splittings[splittings.length - 1].indexOf(":") > -1) {
                    // we have a metric leaf and split the last element at ":"
                    const tempSplitting = splittings[splittings.length - 1].split(":");
                    // change the last splitting to the first split result - the part before ":"
                    splittings[splittings.length - 1] = tempSplitting[0];
                    // add the metric leaf element to the splittings - the part after ":"
                    splittings.push(":" + tempSplitting[1]);
                }

                // if we don't have the segment already ...
                if (!segmentMap[splittings[segmentIndex]]) {
                    // ... add the segment
                    segmentMap[splittings[segmentIndex]] = {
                        value: splittings[segmentIndex],
                        // the segment is expandable if there are more splittings after the splitting corresponding to the index
                        expandable: segmentIndex < splittings.length - 1
                    }
                }
            });

            // sort the segments alphabetically
            return Object.keys(segmentMap).sort((a, b) => {
                const la = a.toLowerCase(), lb = b.toLowerCase();
                if (la > lb)
                    return 1;
                if (la < lb)
                    return -1;
                return 0;
            }).map((segment) => {
                // return proper segment objects
                return this.uiSegmentSrv.newSegment({
                    value: segmentMap[segment].value,
                    expandable: segmentMap[segment].expandable
                });
            });
        };
    }
}