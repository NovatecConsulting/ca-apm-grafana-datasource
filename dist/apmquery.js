"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var apmrawquery_1 = require("./apmrawquery");
var ApmQuery = /** @class */ (function () {
    function ApmQuery(uiSegmentSrv, queryModel) {
        var _this = this;
        this.uiSegmentSrv = uiSegmentSrv;
        if (!queryModel) {
            queryModel = new ApmQueryModel();
            var newAgentSegment = new AbstractQuerySegment();
            newAgentSegment.fake = true;
            newAgentSegment.value = "select agent";
            queryModel.agentSegments = [newAgentSegment];
            var newMetricSegment = new AbstractQuerySegment();
            newMetricSegment.fake = true;
            newMetricSegment.value = "select metric";
            queryModel.metricSegments = [newMetricSegment];
            queryModel.temporalResolution = "";
        }
        this.queryModel = queryModel;
        this.agentSegments = queryModel.agentSegments.map((function (abstractSegment) {
            return _this.createUiSegmentFromAbstractSegment(abstractSegment);
        }));
        this.metricSegments = queryModel.metricSegments.map((function (abstractSegment) {
            return _this.createUiSegmentFromAbstractSegment(abstractSegment);
        }));
        var rawQuery = new apmrawquery_1.default();
        rawQuery.agentRegex = this.getAgentRegex(this.agentSegments.length, false);
        rawQuery.metricRegex = this.getMetricRegex(this.metricSegments.length, false);
        rawQuery.temporalResolution = this.queryModel.temporalResolution;
        this.rawQuery = rawQuery;
    }
    ApmQuery.prototype.updateMetricSegments = function (metricSegment, segmentIndex) {
        this.updateSegments(this.metricSegments, this.queryModel.metricSegments, metricSegment, segmentIndex, "select metric");
        this.rawQuery.metricRegex = this.getMetricRegex(this.metricSegments.length, false);
    };
    ApmQuery.prototype.updateAgentSegments = function (agentSegment, segmentIndex) {
        this.updateSegments(this.agentSegments, this.queryModel.agentSegments, agentSegment, segmentIndex, "select agent");
        this.rawQuery.agentRegex = this.getAgentRegex(this.agentSegments.length, false);
    };
    ApmQuery.prototype.setTemporalResolution = function (temporalResolution) {
        this.queryModel.temporalResolution = temporalResolution;
        this.rawQuery.temporalResolution = temporalResolution;
    };
    ApmQuery.prototype.getAgentRegex = function (segmentIndex, trailingSeparator) {
        segmentIndex = segmentIndex ? segmentIndex : this.agentSegments.length;
        trailingSeparator = trailingSeparator ? trailingSeparator : false;
        var segmentPath = '';
        if (segmentIndex > 0 && this.agentSegments.length > 0) {
            // we only need the segments up to the specified index
            var slicedSegments = this.agentSegments.slice(0, segmentIndex);
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
    ApmQuery.prototype.getMetricRegex = function (segmentIndex, trailingSeparator) {
        segmentIndex = segmentIndex ? segmentIndex : this.metricSegments.length;
        trailingSeparator = trailingSeparator ? trailingSeparator : false;
        var segmentPath = '';
        if (segmentIndex > 0 && this.metricSegments.length > 0) {
            // we only need the segments up to the specified index
            var slicedSegments = this.metricSegments.slice(0, segmentIndex);
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
    ApmQuery.prototype.getAgentSegments = function () {
        return this.queryModel.agentSegments;
    };
    ApmQuery.prototype.getMetricSegments = function () {
        return this.queryModel.metricSegments;
    };
    ApmQuery.prototype.getTemporalResolution = function () {
        return this.queryModel.temporalResolution;
    };
    ApmQuery.prototype.getRawQuery = function () {
        return this.rawQuery;
    };
    ApmQuery.prototype.cloneRawQuery = function () {
        return JSON.parse(JSON.stringify(this.rawQuery));
    };
    ApmQuery.prototype.updateSegments = function (segments, abstractSegments, updatedSegment, updatedSegmentIndex, newSegmentLabel) {
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
        abstractSegments.length = 0;
        segments.forEach(function (uiSegment) {
            var abstractSegment = new AbstractQuerySegment(uiSegment);
            abstractSegments.push(abstractSegment);
        });
    };
    ApmQuery.prototype.createUiSegmentFromAbstractSegment = function (abstractSegment) {
        return this.uiSegmentSrv.newSegment({
            fake: abstractSegment.fake,
            value: abstractSegment.value,
            expandable: abstractSegment.expandable,
            text: abstractSegment.text
        });
    };
    return ApmQuery;
}());
exports.ApmQuery = ApmQuery;
var ApmQueryModel = /** @class */ (function () {
    function ApmQueryModel() {
    }
    return ApmQueryModel;
}());
exports.ApmQueryModel = ApmQueryModel;
var AbstractQuerySegment = /** @class */ (function () {
    function AbstractQuerySegment(uiSegment) {
        this.fake = uiSegment && uiSegment.fake || false;
        this.value = uiSegment && uiSegment.value || "";
        this.expandable = uiSegment && uiSegment.expandable || false;
        this.text = uiSegment && uiSegment.text || "";
    }
    return AbstractQuerySegment;
}());
