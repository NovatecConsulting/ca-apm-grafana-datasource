import angular from 'angular';
import { QueryCtrl } from 'app/plugins/sdk';

export class ApmQueryCtrl extends QueryCtrl {

    static templateUrl = 'partials/query.editor.html';

    metricSegments: any[];
    agentSegments: any[];
    frequency: string;

    frequencyOptions: string[] = ["15s", "30s", "1m", "2m", "6m", "12m", "24m", "48m", "1h", "168m", "12h"];

    scope: any;

    constructor($scope, $injector, private $q, private uiSegmentSrv, private templateSrv) {
        super($scope, $injector);

        this.uiSegmentSrv = uiSegmentSrv;
        this.scope = $scope;

        this.parseTarget();
    }

    toggleEditorMode() {
        this.target.rawQuery = !this.target.rawQuery;
        if (!this.target.rawQuery) {
            // set regex according to segments when switching back from raw query mode
            this.target.metricRegex = this.getSegmentPathUpToIndex(this.metricSegments, this.metricSegments.length, false);
            this.target.agentRegex = this.getSegmentPathUpToIndex(this.agentSegments, this.agentSegments.length, false);
            this.panelCtrl.refresh();
        }
    }

    onChangeInternal() {
        this.panelCtrl.refresh();
    }

    onMetricSegmentUpdate = (metricSegment, segmentIndex) => {        
        this.updateSegments(this.metricSegments, metricSegment, segmentIndex, "select metric")
        this.target.metricRegex = this.getSegmentPathUpToIndex(this.metricSegments, this.metricSegments.length, false);
        this.panelCtrl.refresh();
    }

    onAgentSegmentUpdate = (agentSegment, segmentIndex) => {
        this.updateSegments(this.agentSegments, agentSegment, segmentIndex, "select agent")
        this.target.agentRegex = this.getSegmentPathUpToIndex(this.agentSegments, this.agentSegments.length, false);
        this.panelCtrl.refresh();
    }

    onFrequencyUpdate() {
        this.target.dataFrequency = this.frequency;
        this.panelCtrl.refresh();
    }

    getAgentSegments(index) {
        const agentRegex = this.getSegmentPathUpToIndex(this.agentSegments, index, true);
        return this.datasource.getAgentSegments(agentRegex)
            .then(this.transformPathToSegments(index));
    }

    getMetricSegments(index) {
        const agentRegex = this.getSegmentPathUpToIndex(this.agentSegments, this.agentSegments.length, true);
        const metricRegex = this.getSegmentPathUpToIndex(this.metricSegments, index, false);
        return this.datasource.getMetricSegments(agentRegex, metricRegex)
            .then(this.transformPathToSegments(index));
    }

    getFrequencyOptions() {
        return this.frequencyOptions
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
        return "" + this.target.agentRegex + "|" + this.target.metricRegex + " [" + this.target.dataFrequency + "]"
    }

    private parseTarget() {
        
        this.agentSegments = [];
        this.metricSegments = [];

        if (this.target.agentRegex) {
            this.target.agentRegex.split('|').forEach((element, index, arr) => {
                let expandable = true;
                if (index === arr.length - 1) {
                    expandable = false;
                }
                const newSegment = this.uiSegmentSrv.newSegment({
                    value: element,
                    expandable: expandable
                });
                this.agentSegments.push(newSegment);
            });

        } else {
            this.agentSegments = [this.uiSegmentSrv.newSegment({
                value: "select agent",
                fake: true
            })];
        }

        if (this.target.metricRegex) {
            this.target.metricRegex.split(/[\|:]/).forEach((element, index, arr) => {
                let expandable = true;
                if (index === arr.length - 1) {
                    expandable = false;
                }
                const newSegment = this.uiSegmentSrv.newSegment({
                    value: element,
                    expandable: expandable
                });
                this.metricSegments.push(newSegment);
            });

        } else {
            this.metricSegments = [this.uiSegmentSrv.newSelectMetric()];
        }

        if (this.target.dataFrequency) {
            this.frequency = this.target.dataFrequency;
        } else {
            this.frequency = "select data frequency";
        }

        if (typeof this.target.autoEscape === 'undefined' || this.target.autoEscape === null) {
            this.target.autoEscape = true;
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

    private updateSegments(segments, updatedSegment, updatedSegmentIndex, newSegmentLabel) {
        
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
    }

    private getSegmentPathUpToIndex(segments, index, trailingSeparator) {

        let segmentPath = '';

        if (index > 0 && segments.length > 0) {
            // we only need the segments up to the specified index
            const slicedSegments = segments.slice(0, index);

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
}