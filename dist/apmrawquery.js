"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var ApmRawQuery = /** @class */ (function () {
    function ApmRawQuery() {
        this.agentRegex = "";
        this.metricRegex = "";
        this.temporalResolution = "";
        this.isAutoEscapingEnabled = true;
        this.aggregationMode = "none";
    }
    return ApmRawQuery;
}());
exports.default = ApmRawQuery;
