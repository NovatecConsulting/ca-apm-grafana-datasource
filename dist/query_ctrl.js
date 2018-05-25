"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var sdk_1 = require("app/plugins/sdk");
var ApmQueryCtrl = /** @class */ (function (_super) {
    __extends(ApmQueryCtrl, _super);
    function ApmQueryCtrl($scope, $injector, $q, uiSegmentSrv, templateSrv) {
        var _this = _super.call(this, $scope, $injector) || this;
        _this.$q = $q;
        _this.uiSegmentSrv = uiSegmentSrv;
        _this.templateSrv = templateSrv;
        _this.frequencyOptions = ["15s", "30s", "1m", "2m", "6m", "12m", "24m", "48m", "1h", "168m", "12h"];
        _this.onMetricSegmentUpdate = function (metricSegment, segmentIndex) {
            _this.updateSegments(_this.metricSegments, metricSegment, segmentIndex, "select metric");
            _this.target.metricRegex = _this.getSegmentPathUpToIndex(_this.metricSegments, _this.metricSegments.length, false);
            _this.panelCtrl.refresh();
        };
        _this.onAgentSegmentUpdate = function (agentSegment, segmentIndex) {
            _this.updateSegments(_this.agentSegments, agentSegment, segmentIndex, "select agent");
            _this.target.agentRegex = _this.getSegmentPathUpToIndex(_this.agentSegments, _this.agentSegments.length, false);
            _this.panelCtrl.refresh();
        };
        _this.uiSegmentSrv = uiSegmentSrv;
        _this.scope = $scope;
        _this.parseTarget();
        return _this;
    }
    ApmQueryCtrl.prototype.toggleEditorMode = function () {
        this.target.rawQuery = !this.target.rawQuery;
        if (!this.target.rawQuery) {
            // set regex according to segments when switching back from raw query mode
            this.target.metricRegex = this.getSegmentPathUpToIndex(this.metricSegments, this.metricSegments.length, false);
            this.target.agentRegex = this.getSegmentPathUpToIndex(this.agentSegments, this.agentSegments.length, false);
            this.panelCtrl.refresh();
        }
    };
    ApmQueryCtrl.prototype.onChangeInternal = function () {
        this.panelCtrl.refresh();
    };
    ApmQueryCtrl.prototype.onFrequencyUpdate = function () {
        this.target.dataFrequency = this.frequency;
        this.panelCtrl.refresh();
    };
    ApmQueryCtrl.prototype.getAgentSegments = function (index) {
        var agentRegex = this.getSegmentPathUpToIndex(this.agentSegments, index, true);
        return this.datasource.getAgentSegments(agentRegex)
            .then(this.transformPathToSegments(index));
    };
    ApmQueryCtrl.prototype.getMetricSegments = function (index) {
        var agentRegex = this.getSegmentPathUpToIndex(this.agentSegments, this.agentSegments.length, true);
        var metricRegex = this.getSegmentPathUpToIndex(this.metricSegments, index, false);
        return this.datasource.getMetricSegments(agentRegex, metricRegex)
            .then(this.transformPathToSegments(index));
    };
    ApmQueryCtrl.prototype.getFrequencyOptions = function () {
        return this.frequencyOptions
            .concat(this.templateSrv.variables.filter(function (variable) {
            return variable.type === "interval";
        })
            .map(function (variable) {
            return "$" + variable.name;
        }))
            .map(function (interval) {
            return {
                text: interval,
                value: interval
            };
        });
    };
    ApmQueryCtrl.prototype.getCollapsedText = function () {
        return "" + this.target.agentRegex + "|" + this.target.metricRegex + " [" + this.target.dataFrequency + "]";
    };
    ApmQueryCtrl.prototype.parseTarget = function () {
        var _this = this;
        this.agentSegments = [];
        this.metricSegments = [];
        if (this.target.agentRegex) {
            this.target.agentRegex.split('|').forEach(function (element, index, arr) {
                var expandable = true;
                if (index === arr.length - 1) {
                    expandable = false;
                }
                var newSegment = _this.uiSegmentSrv.newSegment({
                    value: element,
                    expandable: expandable
                });
                _this.agentSegments.push(newSegment);
            });
        }
        else {
            this.agentSegments = [this.uiSegmentSrv.newSegment({
                    value: "select agent",
                    fake: true
                })];
        }
        if (this.target.metricRegex) {
            this.target.metricRegex.split(/[\|:]/).forEach(function (element, index, arr) {
                var expandable = true;
                if (index === arr.length - 1) {
                    expandable = false;
                }
                var newSegment = _this.uiSegmentSrv.newSegment({
                    value: element,
                    expandable: expandable
                });
                _this.metricSegments.push(newSegment);
            });
        }
        else {
            this.metricSegments = [this.uiSegmentSrv.newSelectMetric()];
        }
        if (this.target.dataFrequency) {
            this.frequency = this.target.dataFrequency;
        }
        else {
            this.frequency = "select data frequency";
        }
        if (typeof this.target.autoEscape === 'undefined' || this.target.autoEscape === null) {
            this.target.autoEscape = true;
        }
    };
    ApmQueryCtrl.prototype.transformPathToSegments = function (segmentIndex) {
        var _this = this;
        return function (paths) {
            var splittedPaths = [];
            var segmentMap = {};
            // split all paths at "|"
            for (var i = 0; i < paths.length; i++) {
                splittedPaths.push(paths[i].split("|"));
            }
            splittedPaths.forEach(function (splittings) {
                // if the last splitting contains a ":" character ...
                if (splittings[splittings.length - 1].indexOf(":") > -1) {
                    // we have a metric leaf and split the last element at ":"
                    var tempSplitting = splittings[splittings.length - 1].split(":");
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
                    };
                }
            });
            // sort the segments alphabetically
            return Object.keys(segmentMap).sort(function (a, b) {
                var la = a.toLowerCase(), lb = b.toLowerCase();
                if (la > lb)
                    return 1;
                if (la < lb)
                    return -1;
                return 0;
            }).map(function (segment) {
                // return proper segment objects
                return _this.uiSegmentSrv.newSegment({
                    value: segmentMap[segment].value,
                    expandable: segmentMap[segment].expandable
                });
            });
        };
    };
    ApmQueryCtrl.prototype.updateSegments = function (segments, updatedSegment, updatedSegmentIndex, newSegmentLabel) {
        // discard trailing segments if the updated segment does NOT end with a wildcard
        // reasoning: most likely the trailing segments don't make any sense within the new context
        if (updatedSegment.value.slice(-1) != '*') {
            segments.length = updatedSegmentIndex + 1;
        }
        // if the updated segments ends with a wildcard, make it expandable
        // reasoning: a wildcard segment might allow additional browsable path elements
        if (updatedSegment.value.slice(-1) == '*') {
            updatedSegment.expandable = true;
        }
        if (updatedSegmentIndex == segments.length - 1 && updatedSegment.expandable) {
            segments.push(this.uiSegmentSrv.newSegment({
                value: newSegmentLabel,
                fake: true
            }));
        }
    };
    ApmQueryCtrl.prototype.getSegmentPathUpToIndex = function (segments, index, trailingSeparator) {
        var segmentPath = '';
        if (index > 0 && segments.length > 0) {
            // we only need the segments up to the specified index
            var slicedSegments = segments.slice(0, index);
            // join segments using the "|" character
            slicedSegments.forEach(function (segment, segmentIndex) {
                if (!segment.fake) {
                    if (segmentIndex === 0 || segment.value.indexOf(":") > -1) {
                        segmentPath += segment.value;
                    }
                    else {
                        segmentPath += "|" + segment.value;
                    }
                }
            });
            if (trailingSeparator && slicedSegments[slicedSegments.length - 1].expandable) {
                segmentPath += "|";
            }
        }
        return segmentPath;
    };
    ApmQueryCtrl.templateUrl = 'partials/query.editor.html';
    return ApmQueryCtrl;
}(sdk_1.QueryCtrl));
exports.ApmQueryCtrl = ApmQueryCtrl;
