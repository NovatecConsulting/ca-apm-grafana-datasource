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
// @ts-ignore
var sdk_1 = require("app/plugins/sdk");
var apmquery_1 = require("./apmquery");
var apmrawquery_1 = require("./apmrawquery");
var ApmQueryCtrl = /** @class */ (function (_super) {
    __extends(ApmQueryCtrl, _super);
    function ApmQueryCtrl($scope, $injector, $q, uiSegmentSrv, templateSrv) {
        var _this = _super.call(this, $scope, $injector) || this;
        _this.$q = $q;
        _this.uiSegmentSrv = uiSegmentSrv;
        _this.templateSrv = templateSrv;
        _this.onMetricSegmentUpdate = function (metricSegment, segmentIndex) {
            //this.updateSegments(this.metricSegments, metricSegment, segmentIndex, "select metric")
            _this.query.updateMetricSegments(metricSegment, segmentIndex);
            //this.target.metricRegex = this.getSegmentPathUpToIndex(this.metricSegments, this.metricSegments.length, false);        
            _this.panelCtrl.refresh();
        };
        _this.onAgentSegmentUpdate = function (agentSegment, segmentIndex) {
            //this.updateSegments(this.agentSegments, agentSegment, segmentIndex, "select agent")
            _this.query.updateAgentSegments(agentSegment, segmentIndex);
            //this.target.agentRegex = this.getSegmentPathUpToIndex(this.agentSegments, this.agentSegments.length, false);
            _this.panelCtrl.refresh();
        };
        _this.uiSegmentSrv = uiSegmentSrv;
        _this.scope = $scope;
        _this._target = _this.target;
        _this.parseTarget();
        return _this;
    }
    ApmQueryCtrl.prototype.toggleEditorMode = function () {
        if (!this._target.isRawQueryModeEnabled) {
            // set regex according to segments when switching back from raw query mode
            //this.target.metricRegex = this.getSegmentPathUpToIndex(this.metricSegments, this.metricSegments.length, false);
            //this.target.agentRegex = this.getSegmentPathUpToIndex(this.agentSegments, this.agentSegments.length, false);
            this._target.rawQuery = this.query.cloneRawQuery();
        }
        else {
            this._target.rawQuery = this.query.getRawQuery();
        }
        this._target.isRawQueryModeEnabled = !this._target.isRawQueryModeEnabled;
        this.panelCtrl.refresh();
    };
    ApmQueryCtrl.prototype.onChangeInternal = function () {
        this.panelCtrl.refresh();
    };
    ApmQueryCtrl.prototype.onFrequencyUpdate = function () {
        //this.target.dataFrequency = this.frequency;
        this.query.setTemporalResolution(this.temporalResolution);
        this.panelCtrl.refresh();
    };
    ApmQueryCtrl.prototype.getAgentSegments = function (index) {
        //const agentRegex = this.getSegmentPathUpToIndex(this.agentSegments, index, true);
        var agentRegex = this.query.getAgentRegex(index, true);
        return this.datasource.getAgentSegments(agentRegex)
            .then(this.transformPathToSegments(index));
    };
    ApmQueryCtrl.prototype.getMetricSegments = function (index) {
        //const agentRegex = this.getSegmentPathUpToIndex(this.agentSegments, this.agentSegments.length, true);
        var agentRegex = this.query.getAgentRegex(null, true);
        //const metricRegex = this.getSegmentPathUpToIndex(this.metricSegments, index, false);
        var metricRegex = this.query.getMetricRegex(index, false);
        return this.datasource.getMetricSegments(agentRegex, metricRegex)
            .then(this.transformPathToSegments(index));
    };
    ApmQueryCtrl.prototype.getFrequencyOptions = function () {
        return ApmQueryCtrl.frequencyOptions
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
        if (!this._target.isRawQueryModeEnabled) {
            return "" + this._target.rawQuery.agentRegex + "|" + this._target.rawQuery.metricRegex + " [" + this._target.rawQuery.temporalResolution + "]";
        }
        else {
            return "" + this.query.getAgentRegex + "|" + this.query.getMetricRegex + " [" + this.query.getTemporalResolution + "]";
        }
    };
    ApmQueryCtrl.prototype.parseTarget = function () {
        if (this._target.isRawQueryModeEnabled) {
            if (!this._target.rawQuery) {
                this._target.rawQuery = new apmrawquery_1.default();
            }
            this.query = new apmquery_1.ApmQuery(this.uiSegmentSrv);
            this._target.queryModel = this.query.queryModel;
            this.temporalResolution = this._target.rawQuery.temporalResolution || "select temporal resolution";
        }
        else {
            if (!this._target.queryModel) {
                this.query = new apmquery_1.ApmQuery(this.uiSegmentSrv);
                this._target.queryModel = this.query.queryModel;
            }
            else {
                this.query = new apmquery_1.ApmQuery(this.uiSegmentSrv, this._target.queryModel);
            }
            this._target.rawQuery = this.query.getRawQuery();
            this.temporalResolution = this.query.getTemporalResolution() || "select temporal resolution";
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
    ApmQueryCtrl.templateUrl = 'partials/query.editor.html';
    ApmQueryCtrl.frequencyOptions = ["15s", "30s", "1m", "2m", "6m", "12m", "24m", "48m", "1h", "168m", "12h"];
    return ApmQueryCtrl;
}(sdk_1.QueryCtrl));
exports.ApmQueryCtrl = ApmQueryCtrl;
